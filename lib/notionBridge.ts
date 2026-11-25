/**
 * Creating Notion task pages and reading their status. The Notion token must stay secret, so
 * the browser goes through one of two servers that hold it:
 *   - the local bridge (scripts/notion-bridge.mjs) when NEXT_PUBLIC_NOTION_BRIDGE_URL is set (dev)
 *   - otherwise the Apps Script web app (lib/Code.gs: createNotionTask / notionStatus) — the deployed site
 */
import type { AssignedTask } from "./taskAssign";
import { callScript, SCRIPT_URL } from "./scriptApi";

export const NOTION_BRIDGE_URL = process.env.NEXT_PUBLIC_NOTION_BRIDGE_URL ?? "";

/** true when this build can create tasks in Notion at all */
export const NOTION_ENABLED = !!NOTION_BRIDGE_URL || !!SCRIPT_URL;

/** Create the task page in Notion; resolves with the page id and URL. */
export async function pushTaskToNotion(task: AssignedTask): Promise<{ id: string; url: string }> {
  if (NOTION_BRIDGE_URL) {
    const res = await fetch(`${NOTION_BRIDGE_URL}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; url?: string; error?: string };
    if (!res.ok || !json.url || !json.id) throw new Error(json.error ?? `bridge ${res.status}`);
    return { id: json.id, url: json.url };
  }
  if (!SCRIPT_URL) throw new Error("Notion is not configured");
  const json = await callScript<{ ok?: boolean; id?: string; url?: string; error?: string }>({ action: "createNotionTask", task });
  if (!json.ok || !json.url || !json.id) throw new Error(json.error ?? "script error");
  return { id: json.id, url: json.url };
}

/** A designer's queue: unfinished tasks they are Assignee of (Not Started / Open / In Progress) */
export interface DesignerQueue { open: number; lastDue: string | null }

/** Notion user id → their queue */
export async function fetchDesignerLoad(): Promise<Record<string, DesignerQueue>> {
  if (!NOTION_ENABLED) return {};
  type Reply = { results?: Record<string, DesignerQueue>; error?: string };
  const json: Reply = NOTION_BRIDGE_URL
    ? await fetch(`${NOTION_BRIDGE_URL}/designers/load`).then((r) => r.json() as Promise<Reply>)
    : await callScript<Reply>({ action: "designerLoad" });
  if (!json.results) throw new Error(json.error ?? "designer load failed");
  return json.results;
}

export interface NotionTaskState {
  status: string | null; // value of the "Status" property
  inTrash: boolean;      // page was deleted (moved to trash) in Notion
  notFound?: boolean;    // page no longer exists or the integration lost access
}

/** The script checks at most this many pages per request (lib/Code.gs → notionStatus). */
const STATUS_BATCH = 50;

/** Read the current Notion state of several task pages (ids from their URLs), 50 per request. */
export async function fetchNotionStatuses(ids: string[]): Promise<Record<string, NotionTaskState>> {
  if (ids.length === 0 || !NOTION_ENABLED) return {};
  type Reply = { results?: Record<string, NotionTaskState>; error?: string };
  const out: Record<string, NotionTaskState> = {};
  for (let i = 0; i < ids.length; i += STATUS_BATCH) {
    const batch = ids.slice(i, i + STATUS_BATCH);
    const json: Reply = NOTION_BRIDGE_URL
      ? await fetch(`${NOTION_BRIDGE_URL}/tasks/status?ids=${batch.map(encodeURIComponent).join(",")}`).then((r) => r.json() as Promise<Reply>)
      : await callScript<Reply>({ action: "notionStatus", ids: batch });
    if (!json.results) throw new Error(json.error ?? "status failed");
    Object.assign(out, json.results);
  }
  return out;
}
