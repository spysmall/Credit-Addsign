/**
 * Task assignment (web form replacing the Notion form).
 * Tasks are kept in localStorage per month and mirrored to the shared "Web Tasks" sheet
 * (lib/sheetWebTasks.ts), which every signed-in browser merges back in.
 * Field names mirror the Notion form so they can be pushed there later.
 */
import type { DistConfig, DistTeam } from "./distribution";
import type { TeamUsage } from "./sheetTasks";
import type { RequestTypeKey } from "./priceTable";
import { fetchWebTasks, saveTaskToSheet } from "./sheetWebTasks";

export const PRIORITIES = ["Low", "Normal", "High", "Urgent"] as const;

export const PROJECTS = [
  "TR", "Infestation/WarZTH", "CB-Revo", "CBM-TH", "CBM-SEA", "CBPC-TH", "CBPC-SEA",
  "CBRED", "iHAVE", "9yin", "Z4", "Z4M", "GE", "AUDD", "Aztek", "FOW", "KS", "Other",
];

/** Display-only project names (stored values stay as the Notion option names). */
const PROJECT_DISPLAY: Record<string, string> = {
  "Infestation/WarZTH": "WarZTH",
  "CBRED": "CB-RED",
  "iHAVE": "IHAVE",
  "9yin": "9Yin",
};
export const projectDisplay = (v: string) => PROJECT_DISPLAY[v] ?? v;

export const WORK_TYPES = [
  "Banner/Banner Ads", "Logo", "Icon", "Photography/Retouch", "Present",
  "Storyboard/VDO", "Sound/Edit Sound", "Merch", "Research", "Other",
];

const CRI_GROUP = "CRI, Aztek, Topfiar, Other";

/** "Task Team Creator" options → credit summaryGroup */
export const TEAM_OPTIONS: { label: string; group: string }[] = [
  { label: "GP",              group: "GP" },
  { label: "MKT-Performance", group: "MKT Performance" },
  { label: "AGX-Biz",         group: "AGX" },
  { label: "AGX-GS",          group: "AGX" },
  { label: "SEO",             group: "MKT Performance" },
  { label: "BD-CB",           group: "BD(CB)" },
  { label: "HOF",             group: "BD(HOF)" },
  { label: "Design",          group: "Director&Manager&Edit" },
  { label: "Content",         group: CRI_GROUP },
  { label: "Commu",           group: "GP" },
  { label: "Dev",             group: CRI_GROUP },
  { label: "BD-WangRuay",     group: "WR" },
  { label: "CDM",             group: CRI_GROUP },
  { label: "Topfiar",         group: CRI_GROUP },
];

/** Display-only names for team labels (stored/matched values stay as in TEAM_OPTIONS). */
const TEAM_DISPLAY: Record<string, string> = {
  "MKT-Performance": "MKT",
  "AGX-Biz": "AGX(Biz)",
  "AGX-GS": "AGX(GS)",
  "BD-CB": "BD(CB)",
  "Design": "DS",
  "BD-WangRuay": "BD(WR)",
  "Topfiar": "TF",
};
export const teamDisplay = (label: string) => TEAM_DISPLAY[label] ?? label;

/** "งานของบริษัท" options → distribution company id */
export const COMPANY_OPTIONS: { label: string; id: string }[] = [
  { label: "HOF",       id: "hof" },
  { label: "CB",        id: "cb" },
  { label: "AGX",       id: "agx" },
  { label: "CRI",       id: "cri" },
  { label: "EXE",       id: "exe" },
  { label: "AZT",       id: "cri" },
  { label: "Wang Ruay", id: "wr" },
  { label: "Other",     id: "cri" },
];

export interface AssignedLine {
  code: string;
  name: string;
  requestType: RequestTypeKey;
  qty: number;
  unitCredit: number;
  credit: number;
}

export interface AssignedTask {
  id: string;
  createdAt: string;      // ISO
  year: number;
  month: number;
  cardId: string;         // distribution team card that was charged
  creatorEmail?: string;  // Google account that added the task
  title: string;          // ชื่อชิ้นงาน
  priority: string;
  projects: string[];
  createdBy: string;      // สร้างโดย (display name)
  createdByEmail?: string; // สร้างโดย — Notion account email, to map to a Notion user later
  owner: string;          // ชื่อเจ้าของงาน (text sent to Notion, e.g. "GP : Name")
  ownerEmail?: string;    // the owner's account, so the task also shows in their "งานของฉัน"
  refFiles: { name: string; size: number }[];
  link: string;           // Link ไฟล์งาน&ความต้องการ
  objective: string;
  summary: string;        // สรุปจำนวนชิ้นงาน
  workTypes: string[];    // ประเภทของงาน
  useCredit: number;
  needBy: string;         // กำหนดเวลาที่ต้องการชิ้นงาน (YYYY-MM-DD)
  useDate: string;        // วันที่ต้องใช้งานจริง (YYYY-MM-DD)
  teamCreator: string;    // Task Team Creator
  company: string;        // งานของบริษัท
  lines: AssignedLine[];
  notionUrl?: string;     // link to the task page in Notion — set once the task has been created there
  notionPushedAt?: string; // ISO time the task was created in Notion
  notionStatus?: string;   // last "Status" read back from Notion (Not Started, In Progress, Done, …)
  notionCheckedAt?: string; // ISO time the status was last read
  cancelled?: boolean;     // the Notion page was moved to trash → task is void and its credit is returned
  cancelledAt?: string;
  updatedAt?: string;      // ISO time of the last change; the newer copy wins when merging with the shared sheet
}

/** Notion page id (32 hex) from a page URL. */
export const notionPageId = (url?: string) => url?.match(/([0-9a-f]{32})(?:[?#]|$)/i)?.[1] ?? null;

export const newTaskId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const KEY = (y: number, m: number) => `credit-assigned-v1-${y}-${m}`;

export function loadAssigned(year: number, month: number): AssignedTask[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY(year, month));
    return raw ? (JSON.parse(raw) as AssignedTask[]) : [];
  } catch {
    return [];
  }
}

/** Every month that has tasks stored in this browser, newest first. */
export function assignedMonths(): { year: number; month: number }[] {
  if (typeof window === "undefined") return [];
  const out: { year: number; month: number }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const m = localStorage.key(i)?.match(/^credit-assigned-v1-(\d{4})-(\d{1,2})$/);
    if (m) out.push({ year: Number(m[1]), month: Number(m[2]) });
  }
  return out.sort((a, b) => b.year - a.year || b.month - a.month);
}

function saveAssigned(year: number, month: number, tasks: AssignedTask[]) {
  localStorage.setItem(KEY(year, month), JSON.stringify(tasks));
}

export function addAssigned(task: AssignedTask) {
  const t = { ...task, updatedAt: new Date().toISOString() };
  // re-read right before writing so a second tab can't be overwritten
  const current = loadAssigned(task.year, task.month);
  saveAssigned(task.year, task.month, [...current, t]);
  void saveTaskToSheet(t);
}

/**
 * Pull the shared "Web Tasks" sheet into this browser's store (newer copy wins), so tasks
 * submitted on other devices count toward credit and show up in "งานของฉัน".
 * Returns how many tasks were added or replaced.
 */
export async function syncWebTasks(): Promise<number> {
  const remote = await fetchWebTasks();
  let changed = 0;
  const byMonth = new Map<string, AssignedTask[]>();
  for (const t of remote) {
    const k = `${t.year}-${t.month}`;
    byMonth.set(k, [...(byMonth.get(k) ?? []), t]);
  }
  for (const list of byMonth.values()) {
    const { year, month } = list[0];
    const local = loadAssigned(year, month);
    const index = new Map(local.map((t, i) => [t.id, i]));
    let monthChanged = 0;
    for (const t of list) {
      const i = index.get(t.id);
      if (i === undefined) { local.push(t); monthChanged++; }
      else if ((t.updatedAt ?? "") > (local[i].updatedAt ?? "")) { local[i] = t; monthChanged++; }
    }
    if (monthChanged) saveAssigned(year, month, local);
    changed += monthChanged;
  }
  // tasks only this browser has (e.g. made before sharing existed) → upload them
  const remoteIds = new Set(remote.map((t) => t.id));
  for (const { year, month } of assignedMonths()) {
    for (const t of loadAssigned(year, month)) if (!remoteIds.has(t.id)) void saveTaskToSheet(t);
  }
  return changed;
}

/**
 * Once a task exists in Notion it also shows up in the "[sum] All Task" sheet, which the credit
 * check already reads. After this grace period (time for the sheet to catch up) the local copy
 * stops counting so the same task is not deducted twice.
 */
export const NOTION_SYNC_GRACE_HOURS = 24;
const countsLocally = (t: AssignedTask) => !t.cancelled && (
  !t.notionPushedAt || Date.now() - new Date(t.notionPushedAt).getTime() < NOTION_SYNC_GRACE_HOURS * 3_600_000);

export function updateAssigned(year: number, month: number, id: string, patch: Partial<AssignedTask>) {
  let updated: AssignedTask | undefined;
  saveAssigned(year, month, loadAssigned(year, month).map((t) => {
    if (t.id !== id) return t;
    updated = { ...t, ...patch, updatedAt: new Date().toISOString() };
    return updated;
  }));
  if (updated) void saveTaskToSheet(updated);
}

/** Is this task mine — I submitted it, I'm its "สร้างโดย", or I'm its owner? */
export const isMyTask = (t: AssignedTask, email: string) =>
  t.creatorEmail === email || t.createdByEmail === email || t.ownerEmail === email;

export function cancelAssigned(year: number, month: number, id: string) {
  saveAssigned(year, month, loadAssigned(year, month).filter((t) => t.id !== id));
}

/** Credits and task counts charged through the web form, keyed by card id. */
export function webUsageByCard(year: number, month: number): Record<string, { used: number; count: number }> {
  const out: Record<string, { used: number; count: number }> = {};
  for (const t of loadAssigned(year, month).filter(countsLocally)) {
    const e = (out[t.cardId] ??= { used: 0, count: 0 });
    e.used = Math.round((e.used + t.useCredit) * 100) / 100;
    e.count += 1;
  }
  return out;
}

/** Credits charged through the web form this month, per "งานของบริษัท" label. */
export function webCreditByCompany(year: number, month: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of loadAssigned(year, month).filter(countsLocally)) out[t.company] = (out[t.company] ?? 0) + t.useCredit;
  return out;
}

/** Tasks added per team label over the last `days` days (this browser's local data). */
export function recentTeamCounts(days = 30): Record<string, number> {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const now = new Date();
  const out: Record<string, number> = {};
  // a 30-day window can span the current and the previous month
  for (let back = 0; back <= Math.ceil(days / 28); back++) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    for (const t of loadAssigned(d.getFullYear(), d.getMonth() + 1)) {
      if (new Date(t.createdAt).getTime() >= since) out[t.teamCreator] = (out[t.teamCreator] ?? 0) + 1;
    }
  }
  return out;
}

export interface ResolvedCard {
  card: DistTeam;
  companyId: string;
}

/** Find the distribution card a (team, company) selection is charged to. */
export function resolveCard(config: DistConfig, companyLabel: string, teamLabel: string): ResolvedCard | null {
  const group = TEAM_OPTIONS.find((t) => t.label === teamLabel)?.group;
  const companyId = COMPANY_OPTIONS.find((c) => c.label === companyLabel)?.id;
  if (!group || !companyId) return null;

  const all = config.flatMap((p) => p.companies.flatMap((c) => c.teams.map((card) => ({ card, companyId: c.id }))));
  return (
    all.find((x) => x.companyId === companyId && x.card.summaryGroup === group) ??
    all.find((x) => x.card.summaryGroup === group) ??
    all.find((x) => x.card.summaryGroup === CRI_GROUP) ??
    null
  );
}

export interface Availability {
  credit: number;     // team pool: allocated to the team's credit group across ALL companies this month
  sheetUsed: number;  // used according to the task sheet (whole group)
  webUsed: number;    // used through this web form (whole group)
  remaining: number;
}

/** Credit group (summaryGroup) a "Task Team Creator" option draws from. */
export const teamGroup = (label: string) => TEAM_OPTIONS.find((t) => t.label === label)?.group ?? null;

/** Credits charged through the web form for every team of a credit group, all companies. */
export function webUsedForGroup(year: number, month: number, group: string): number {
  const sum = loadAssigned(year, month)
    .filter(countsLocally)
    .filter((t) => teamGroup(t.teamCreator) === group)
    .reduce((s, t) => s + t.useCredit, 0);
  return Math.round(sum * 100) / 100;
}

/**
 * The team's combined pool ("ถังรวม"): one team may spend beyond any single company's share,
 * as long as the total across all companies stays within the pool it was allocated.
 */
export function teamAvailability(
  config: DistConfig,
  total: number,
  usage: Record<string, TeamUsage>,
  group: string,
  webUsed: number,
): Availability {
  const pct = config
    .flatMap((p) => p.companies.flatMap((c) => c.teams))
    .filter((t) => t.summaryGroup === group)
    .reduce((sum, t) => sum + t.pct, 0);
  const credit = Math.round((pct / 100) * total * 100) / 100;
  const sheetUsed = usage[group]?.used ?? 0;
  const remaining = Math.round((credit - sheetUsed - webUsed) * 100) / 100;
  return { credit, sheetUsed, webUsed, remaining };
}
