/**
 * Every call to the Apps Script web app (lib/Code.gs) goes through here. It carries the signed-in
 * person's Firebase ID token, which the script checks with Google before reading or writing anything,
 * so the sheets can stay private and the script URL is useless to anyone who is not on the allowlist.
 */
import { auth } from "./firebase";

export const SCRIPT_URL = process.env.NEXT_PUBLIC_TASKS_SCRIPT_URL || process.env.NEXT_PUBLIC_DIST_SCRIPT_URL || "";

/** The script refused the caller: not signed in, token rejected, or not on the allowlist. */
export class ScriptAuthError extends Error {}

/** POST `body` (plus the caller's ID token) to the Apps Script and return its JSON reply. */
export async function callScript<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  if (!SCRIPT_URL) throw new Error("Apps Script URL is not configured");
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new ScriptAuthError("not signed in");
  const token = await user.getIdToken();
  const res = await fetch(SCRIPT_URL, {
    method: "POST",
    // text/plain avoids a CORS preflight; Apps Script reads e.postData.contents
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...body, token }),
  });
  if (!res.ok) throw new Error(`script ${res.status}`);
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (data.error === "unauthenticated" || data.error === "forbidden") throw new ScriptAuthError(data.error);
  return data as T;
}

/** Sheet tabs the site reads — the script maps each key to one tab (see SHEETS in lib/Code.gs). */
export type SheetKey =
  | "users" | "members" | "discord"
  | "allTask" | "taskUsage" | "dist" | "note" | "webTasks"
  | "leave" | "price";

// several parts of a page ask for the same tab at once → one request per tab every 30 s
const inflight = new Map<SheetKey, { at: number; p: Promise<string> }>();

/** One tab as CSV text (every field quoted, same shape as the old public gviz CSV). */
export function fetchSheetCsv(key: SheetKey): Promise<string> {
  const hit = inflight.get(key);
  if (hit && Date.now() - hit.at < 30_000) return hit.p;
  const p = callScript<{ ok?: boolean; csv?: string; error?: string }>({ action: "csv", sheet: key }).then((d) => {
    if (!d.ok || typeof d.csv !== "string") throw new Error(d.error ?? `sheet ${key} unavailable`);
    return d.csv;
  });
  p.catch(() => inflight.delete(key));
  inflight.set(key, { at: Date.now(), p });
  return p;
}

/** Forget cached tabs after a write, so the next read sees it. */
export function forgetSheet(...keys: SheetKey[]) {
  for (const k of keys) inflight.delete(k);
}
