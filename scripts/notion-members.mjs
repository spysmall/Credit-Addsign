/**
 * Collect every person that appears in Notion for the Media "All Task" database and print a
 * tidy table (JSON by default, CSV with --csv). READ-ONLY: it only calls Notion GET/query endpoints.
 *
 * Sources (merged by Notion user id):
 *   1. /v1/users                         → people the integration can see (members + guests it is allowed to list)
 *   2. "Created by" / "Assignee" people  → everyone referenced by a task, even if /v1/users hides them
 *
 *   node scripts/notion-members.mjs            # JSON rows
 *   node scripts/notion-members.mjs --csv      # CSV
 *   node scripts/notion-members.mjs --values   # the finished 2-D table for the "Member in Notion" sheet tab
 *                                              # (header + one row per person, sorted by group then name)
 *
 * Needs NOTION_TOKEN and NOTION_ALL_TASK_DB (read from .env.local).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
try {
  for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env.local */ }

const TOKEN = env.NOTION_TOKEN;
const DB = (env.NOTION_ALL_TASK_DB ?? "").replace(/-/g, "");
if (!TOKEN || !DB) {
  console.error("Missing NOTION_TOKEN or NOTION_ALL_TASK_DB");
  process.exit(1);
}

async function notion(method, url, body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://api.notion.com/v1${url}`, {
      method,
      headers: { Authorization: `Bearer ${TOKEN}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 1000 * (attempt + 1))); continue; }
    const json = await res.json();
    if (!res.ok) throw new Error(`${method} ${url}: ${json.message ?? res.status}`);
    return json;
  }
  throw new Error(`${method} ${url}: rate limited`);
}

const people = new Map(); // id → row
const row = (id) => {
  if (!people.has(id)) {
    people.set(id, { id, name: "", email: "", inUsersList: false, createdTasks: 0, assignedTasks: 0, firstTask: "", lastTask: "" });
  }
  return people.get(id);
};

// 1) users list
let cursor;
do {
  const r = await notion("GET", `/users?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`);
  for (const u of r.results) {
    if (u.type !== "person") continue; // skip bots/integrations
    const p = row(u.id);
    p.inUsersList = true;
    p.name = u.name ?? p.name;
    p.email = u.person?.email ?? p.email;
  }
  cursor = r.has_more ? r.next_cursor : undefined;
} while (cursor);

// 2) people referenced by tasks (only the two people columns, to keep the payload small)
const db = await notion("GET", `/databases/${DB}`);
const propId = (name) => db.properties[name]?.id;
const createdById = propId("Created by");
const assigneeId = propId("Assignee");
const filterProps = [createdById, assigneeId].filter(Boolean).map((id) => `filter_properties=${encodeURIComponent(id)}`).join("&");

let tasks = 0;
cursor = undefined;
do {
  const r = await notion("POST", `/databases/${DB}/query${filterProps ? `?${filterProps}` : ""}`, {
    page_size: 100,
    ...(cursor ? { start_cursor: cursor } : {}),
  });
  for (const page of r.results) {
    tasks++;
    const when = page.created_time?.slice(0, 10) ?? "";
    for (const [col, key] of [["Created by", "createdTasks"], ["Assignee", "assignedTasks"]]) {
      for (const u of page.properties?.[col]?.people ?? []) {
        if (u.object !== "user" || u.type === "bot") continue;
        const p = row(u.id);
        p.name = p.name || u.name || "";
        p.email = p.email || u.person?.email || "";
        p[key]++;
        if (key === "createdTasks" && when) {
          if (!p.firstTask || when < p.firstTask) p.firstTask = when;
          if (!p.lastTask || when > p.lastTask) p.lastTask = when;
        }
      }
    }
  }
  cursor = r.has_more ? r.next_cursor : undefined;
} while (cursor);

const rows = [...people.values()].sort(
  (a, b) => (a.name || a.email || "~").localeCompare(b.name || b.email || "~", "th"),
);

// ── "Member in Notion" sheet table ──
const ICT = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" });
const NO_NAME = "(ไม่มีชื่อ)";
const stripLead = (n) => n.replace(/^[^0-9A-Za-zก-๙(]+/u, "").trim();
function groupOf(name) {
  if (!name) return "ไม่ระบุ";
  const c = stripLead(name).replace(/^\(/, "");
  const m = c.match(/^([A-Za-z]+(?:\s[A-Za-z]+)?)\s*[:：]/) ?? c.match(/^(GP|AGX|HOF|BD|DS)\s/);
  return m ? m[1].trim().toUpperCase() : "อื่นๆ";
}
function buildValues() {
  const stamp = ICT.format(new Date()).replace("T", " ").slice(0, 16);
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const status = (r) =>
    r.createdTasks > 0 && r.lastTask >= since ? "Active (90 วัน)"
      : r.createdTasks > 0 || r.assignedTasks > 0 ? "เคยมีงาน" : "ไม่มีงาน";
  const source = (r) =>
    r.inUsersList ? (r.createdTasks || r.assignedTasks ? "Users list + Task" : "Users list") : "Task";
  const rank = (g) => (g === "ไม่ระบุ" ? 2 : g === "อื่นๆ" ? 1 : 0);
  const items = rows.map((r) => ({ r, g: groupOf(r.name) }));
  items.sort((a, b) =>
    rank(a.g) - rank(b.g) || a.g.localeCompare(b.g) ||
    stripLead(a.r.name).toLowerCase().localeCompare(stripLead(b.r.name).toLowerCase(), "th"));
  const head = ["ชื่อ", "กลุ่ม (จากชื่อ)", "อีเมล", "สถานะ", "งานที่สร้าง", "งานที่เป็น Assignee",
    "งานแรกที่สร้าง", "งานล่าสุดที่สร้าง", "แหล่งข้อมูล", "Notion User ID", "อัปเดตล่าสุด"];
  return [head, ...items.map(({ r, g }) => [
    r.name || NO_NAME, g, r.email, status(r), r.createdTasks, r.assignedTasks,
    r.firstTask, r.lastTask, source(r), r.id, stamp,
  ])];
}

if (process.argv.includes("--values")) {
  console.log(JSON.stringify(buildValues()));
} else if (process.argv.includes("--csv")) {
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const head = ["name", "email", "inUsersList", "createdTasks", "assignedTasks", "firstTask", "lastTask", "id"];
  console.log([head.join(","), ...rows.map((r) => head.map((h) => esc(r[h])).join(","))].join("\n"));
} else {
  console.log(JSON.stringify({ scannedTasks: tasks, people: rows.length, rows }, null, 2));
}
