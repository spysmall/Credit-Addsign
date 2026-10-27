/**
 * Client for the local Notion bridge (scripts/notion-bridge.mjs).
 * Only active when NEXT_PUBLIC_NOTION_BRIDGE_URL is set (local development for now).
 */
import type { AssignedTask } from "./taskAssign";

export const NOTION_BRIDGE_URL = process.env.NEXT_PUBLIC_NOTION_BRIDGE_URL ?? "";

/** Create the task page in Notion; resolves with the page URL. */
export async function pushTaskToNotion(task: AssignedTask): Promise<{ id: string; url: string }> {
  if (!NOTION_BRIDGE_URL) throw new Error("Notion bridge is not configured");
  const res = await fetch(`${NOTION_BRIDGE_URL}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; url?: string; error?: string };
  if (!res.ok || !json.url || !json.id) throw new Error(json.error ?? `bridge ${res.status}`);
  return { id: json.id, url: json.url };
}

export interface NotionTaskState {
  status: string | null; // value of the "Status" property
  inTrash: boolean;      // page was deleted (moved to trash) in Notion
  notFound?: boolean;    // page no longer exists or the integration lost access
}

/** Read the current Notion state of several task pages (ids from their URLs). */
export async function fetchNotionStatuses(ids: string[]): Promise<Record<string, NotionTaskState>> {
  if (!NOTION_BRIDGE_URL || ids.length === 0) return {};
  const res = await fetch(`${NOTION_BRIDGE_URL}/tasks/status?ids=${ids.map(encodeURIComponent).join(",")}`);
  const json = (await res.json().catch(() => ({}))) as { results?: Record<string, NotionTaskState>; error?: string };
  if (!res.ok || !json.results) throw new Error(json.error ?? `bridge ${res.status}`);
  return json.results;
}
