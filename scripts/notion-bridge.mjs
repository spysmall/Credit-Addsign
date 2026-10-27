/**
 * Local bridge: creates a task page in the Notion "All Task" database from a request
 * submitted on the Assign Task page.
 *
 * Why a bridge: the site is a static export (no backend) and the Notion token must stay secret,
 * so the browser cannot call Notion directly. Run this next to `npm run dev`:
 *
 *   npm run notion:bridge
 *
 * It reads NOTION_TOKEN and NOTION_ALL_TASK_DB from .env.local, listens on 127.0.0.1 only and
 * accepts requests only from the local dev site. For production, move this logic to a real
 * serverless endpoint (the request/response shape can stay the same).
 *
 *   POST /tasks   body: the AssignedTask JSON (see lib/taskAssign.ts)
 *                 query: ?dryRun=1 → return the Notion payload without creating anything
 *                        ?test=1   → create the page without the aiMove automation trigger
 *   → { id, url }
 *
 *   GET  /tasks/status?ids=<pageId>,<pageId>   (read-only)
 *   → { results: { [pageId]: { status, inTrash, notFound? } } }
 */
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* no .env.local */ }
  return env;
}

const env = loadEnv();
const TOKEN = env.NOTION_TOKEN;
const DB = (env.NOTION_ALL_TASK_DB ?? "").replace(/-/g, "");
const PORT = Number(env.NOTION_BRIDGE_PORT ?? 8787);
const ORIGINS = (env.NOTION_BRIDGE_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000").split(",").map((s) => s.trim());
const NOTION = "https://api.notion.com/v1";

if (!TOKEN || !DB) {
  console.error("Missing NOTION_TOKEN or NOTION_ALL_TASK_DB in .env.local");
  process.exit(1);
}

async function notion(method, url, body) {
  const res = await fetch(`${NOTION}${url}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json.message ?? `Notion ${res.status}`), { status: res.status, code: json.code });
  return json;
}

// ── cached lookups ──
let schemaCache = { at: 0, options: {} };
async function allowedOptions() {
  if (Date.now() - schemaCache.at < 10 * 60_000) return schemaCache.options;
  const db = await notion("GET", `/databases/${DB}`);
  const options = {};
  for (const [name, p] of Object.entries(db.properties)) {
    if (p.type === "select" || p.type === "multi_select") options[name] = new Set(p[p.type].options.map((o) => o.name));
  }
  schemaCache = { at: Date.now(), options };
  return options;
}

let usersCache = { at: 0, byEmail: new Map() };
async function notionUserId(email) {
  if (!email) return null;
  if (Date.now() - usersCache.at > 10 * 60_000) {
    const byEmail = new Map();
    let cursor;
    do {
      const r = await notion("GET", `/users?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`);
      for (const u of r.results) if (u.type === "person" && u.person?.email) byEmail.set(u.person.email.toLowerCase(), u.id);
      cursor = r.has_more ? r.next_cursor : undefined;
    } while (cursor);
    usersCache = { at: Date.now(), byEmail };
  }
  return usersCache.byEmail.get(email.toLowerCase()) ?? null;
}

// ── mapping: AssignedTask → Notion properties ──
const str = (v, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");
const richText = (text) => {
  const chunks = [];
  for (let i = 0; i < text.length; i += 1900) chunks.push({ type: "text", text: { content: text.slice(i, i + 1900) } });
  return chunks;
};
const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 30) : []);

async function buildProperties(t, { test }) {
  const options = await allowedOptions();
  const pick = (prop, value) => {
    if (!options[prop]?.has(value)) throw Object.assign(new Error(`"${value}" is not an option of "${prop}" in Notion`), { status: 422 });
    return value;
  };
  const multi = (prop, values) => values.map((v) => ({ name: pick(prop, v) }));

  const title = str(t.title, 200).trim();
  if (!title) throw Object.assign(new Error("title is required"), { status: 422 });
  if (!isDate(t.needBy) || !isDate(t.useDate)) throw Object.assign(new Error("needBy/useDate must be YYYY-MM-DD"), { status: 422 });
  const credit = Number(t.useCredit);
  if (!Number.isFinite(credit) || credit < 0) throw Object.assign(new Error("useCredit must be a number ≥ 0"), { status: 422 });

  const props = {
    Name: { title: [{ type: "text", text: { content: title } }] },
    Priority: { select: { name: pick("Priority", str(t.priority, 20)) } },
    "Project Name": { multi_select: multi("Project Name", list(t.projects)) },
    "Team Create": { multi_select: multi("Team Create", t.teamCreator ? [str(t.teamCreator, 50)] : []) },
    Company: { multi_select: multi("Company", t.company ? [str(t.company, 50)] : []) },
    "ประเภทของงาน": { multi_select: multi("ประเภทของงาน", list(t.workTypes)) },
    "ชื่อเจ้าของงาน [ex. GP : Name]": { rich_text: richText(str(t.owner, 500)) },
    "Objective/วัตถุประสงค์ของชิ้นงาน": { rich_text: richText(str(t.objective, 6000)) },
    "สรุปจำนวนชิ้นงานทั้งหมดที่ต้องทำ (เพื่อความเข้าใจตรงกัน)": { rich_text: richText(str(t.summary, 6000)) },
    Description: { rich_text: richText(str(t.link, 6000)) },
    "Due (กำหนดส่งงาน)": { date: { start: t.needBy } },
    "วันที่ต้องใช้งานจริง": { date: { start: t.useDate } },
    Credit: { number: credit },
    Status: { status: { name: "Not Started" } },
  };
  // same trigger the Notion form sets; skipped for test pages so no automation runs
  if (!test) props.aiMove = { select: { name: "newTask" } };

  const uid = await notionUserId(str(t.createdByEmail, 200) || str(t.creatorEmail, 200));
  if (uid) props["Created by"] = { people: [{ id: uid }] };
  return { props, matchedUser: !!uid };
}

// ── http ──
const done = new Map(); // taskId → { id, url } (idempotency while the bridge runs)

function send(res, status, body, origin) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const allowed = origin && ORIGINS.includes(origin) ? origin : null;
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    res.writeHead(allowed ? 204 : 403, allowed ? {
      "Access-Control-Allow-Origin": allowed, "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600", Vary: "Origin",
    } : {});
    return res.end();
  }
  if (!allowed) return send(res, 403, { error: "origin not allowed" });
  if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true }, allowed);
  if (req.method === "GET" && url.pathname === "/tasks/status") {
    // read-only: current Status and trash state of task pages
    const ids = (url.searchParams.get("ids") ?? "").split(",").map((x) => x.replace(/-/g, "")).filter((x) => /^[0-9a-f]{32}$/i.test(x)).slice(0, 50);
    const results = {};
    await Promise.all(ids.map(async (id) => {
      try {
        const page = await notion("GET", `/pages/${id}`);
        results[id] = { status: page.properties?.Status?.status?.name ?? null, inTrash: !!(page.in_trash || page.archived) };
      } catch (err) {
        results[id] = err.status === 404 ? { status: null, inTrash: false, notFound: true } : { status: null, inTrash: false, error: err.message };
      }
    }));
    return send(res, 200, { results }, allowed);
  }
  if (req.method !== "POST" || url.pathname !== "/tasks") return send(res, 404, { error: "not found" }, allowed);

  try {
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 200_000) return send(res, 413, { error: "payload too large" }, allowed);
    }
    const task = JSON.parse(raw);
    const dryRun = url.searchParams.get("dryRun") === "1";
    const test = url.searchParams.get("test") === "1";
    const key = typeof task.id === "string" ? task.id : null;
    if (key && done.has(key) && !dryRun) return send(res, 200, done.get(key), allowed);

    const { props, matchedUser } = await buildProperties(task, { test });
    if (dryRun) return send(res, 200, { dryRun: true, matchedUser, properties: props }, allowed);

    const page = await notion("POST", "/pages", { parent: { database_id: DB }, properties: props });
    const result = { id: page.id, url: page.url };
    if (key) done.set(key, result);
    console.log(`created ${page.id} (${matchedUser ? "creator matched" : "creator not matched"})`);
    return send(res, 200, result, allowed);
  } catch (err) {
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : err instanceof SyntaxError ? 400 : 500;
    console.error("error:", err.message);
    return send(res, status, { error: err.message }, allowed);
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`Notion bridge on http://127.0.0.1:${PORT} → database ${DB.slice(0, 8)}…`));
