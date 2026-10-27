/**
 * Shared store for tasks submitted on the web, so the submitter, the "สร้างโดย" person and the
 * task owner all see them on any device: one document per task in the Firestore collection
 * "tasks" (project mm-credit-addsign; access rules in firestore.rules).
 *
 * The older "Web Tasks" sheet tab is still read once per sign-in so requests saved there before
 * the move to Firestore are carried over.
 */
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { parseCSV } from "./csv";
import type { AssignedTask } from "./taskAssign";

const TASKS = "tasks";

/** Insert or update the task's document. Resolves false if Firestore refused or was unreachable. */
export async function saveTaskToSheet(task: AssignedTask): Promise<boolean> {
  try {
    // Firestore rejects `undefined` values; a JSON round-trip drops them
    await setDoc(doc(db, TASKS, task.id), JSON.parse(JSON.stringify(task)));
    return true;
  } catch {
    return false;
  }
}

/** Live view of every shared task; returns the unsubscribe function. */
export function subscribeWebTasks(onTasks: (tasks: AssignedTask[]) => void, onError?: (err: Error) => void): () => void {
  return onSnapshot(
    collection(db, TASKS),
    (snap) => onTasks(snap.docs.map((d) => d.data() as AssignedTask).filter((t) => typeof t.id === "string" && t.year && t.month)),
    (err) => onError?.(err),
  );
}

// ── legacy: the "Web Tasks" tab of the credit spreadsheet (read-only, for carrying old rows over) ──
const LEGACY_SHEET_ID = "1b1snrd3X-mM1lhoI_qOgEVX8UG49RKzhTXneFyeW4oY";

export async function fetchLegacySheetTasks(): Promise<AssignedTask[]> {
  const url = `https://docs.google.com/spreadsheets/d/${LEGACY_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent("Web Tasks")}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  const rows = parseCSV(await res.text());
  // gviz silently returns the first tab when "Web Tasks" doesn't exist → only trust a sheet with our header
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
