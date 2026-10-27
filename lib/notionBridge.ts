/**
 * Creating Notion task pages and reading their status. The Notion token must stay secret, so
 * the browser goes through one of two servers that hold it:
 *   - the local bridge (scripts/notion-bridge.mjs) when NEXT_PUBLIC_NOTION_BRIDGE_URL is set (dev)
 *   - otherwise the Apps Script web app (lib/Code.gs: createNotionTask / notionStatus) — the deployed site
 */
import type { AssignedTask } from "./taskAssign";

export const NOTION_BRIDGE_URL = process.env.NEXT_PUBLIC_NOTION_BRIDGE_URL ?? "";
const SCRIPT_URL = process.env.NEXT_PUBLIC_TASKS_SCRIPT_URL || process.env.NEXT_PUBLIC_DIST_SCRIPT_URL || "";

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
  const res = await fetch(SCRIPT_URL, {
    method: "POST",
    // text/plain avoids a CORS preflight; Apps Script reads e.postData.contents
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "createNotionTask", task }),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; url?: string; error?: string };
  if (!json.ok || !json.url || !json.id) throw new Error(json.error ?? `script ${res.status}`);
  return { id: json.id, url: json.url };
}

export interface NotionTaskState {
  status: string | null; // value of the "Status" property
  inTrash: boolean;      // page was deleted (moved to trash) in Notion
  notFound?: boolean;    // page no longer exists or the integration lost access
}

/** Read the current Notion state of several task pages (ids from their URLs). */
export async function fetchNotionStatuses(ids: string[]): Promise<Record<string, NotionTaskState>> {
  if (ids.length === 0 || !NOTION_ENABLED) return {};
  const q = ids.map(encodeURIComponent).join(",");
  const res = NOTION_BRIDGE_URL
    ? await fetch(`${NOTION_BRIDGE_URL}/tasks/status?ids=${q}`)
    : await fetch(`${SCRIPT_URL}?action=notionStatus&ids=${q}`);
  const json = (await res.json().catch(() => ({}))) as { results?: Record<string, NotionTaskState>; error?: string };
  if (!res.ok || !json.results) throw new Error(json.error ?? `status ${res.status}`);
  return json.results;
}
