/**
 * Shared store for tasks submitted on the web, so the submitter, the "สร้างโดย" person and the
 * task owner all see them on any device. Each task is one row in the "Web Tasks" tab of the
 * credit spreadsheet (written by the Apps Script in lib/Code.gs, read via the public gviz CSV).
 */
import { parseCSV } from "./csv";
import type { AssignedTask } from "./taskAssign";

const SHEET_ID = "1b1snrd3X-mM1lhoI_qOgEVX8UG49RKzhTXneFyeW4oY";
const TAB = "Web Tasks";
// the beta site sets only NEXT_PUBLIC_TASKS_SCRIPT_URL, so it can share tasks without writing any other sheet
const SCRIPT_URL = process.env.NEXT_PUBLIC_TASKS_SCRIPT_URL || process.env.NEXT_PUBLIC_DIST_SCRIPT_URL || "";

export const SHARED_TASKS_ENABLED = !!SCRIPT_URL;

/** Insert or update the task's row (matched by id). Resolves false if the request could not be sent. */
export async function saveTaskToSheet(task: AssignedTask): Promise<boolean> {
  if (!SCRIPT_URL) return false;
  try {
    await fetch(SCRIPT_URL, {
      method: "POST",
      // text/plain avoids a CORS preflight; Apps Script reads e.postData.contents
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "saveTask", task }),
    });
    return true;
  } catch {
    return false;
  }
}

/** Every task in the shared tab. */
export async function fetchWebTasks(): Promise<AssignedTask[]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(TAB)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  const rows = parseCSV(await res.text());
  // gviz silently returns the first tab when "Web Tasks" doesn't exist yet → only trust a sheet with our header
  const head = rows.findIndex((r) => r[0]?.trim().toLowerCase() === "id" && r.some((c) => c.trim().toLowerCase() === "json"));
  if (head < 0) return [];
  const col = rows[head].findIndex((c) => c.trim().toLowerCase() === "json");
  const out: AssignedTask[] = [];
  for (const r of rows.slice(head + 1)) {
    try {
      const t = JSON.parse(r[col] ?? "") as AssignedTask;
      if (t && typeof t.id === "string" && t.year && t.month) out.push(t);
    } catch { /* skip malformed rows */ }
  }
  return out;
}
