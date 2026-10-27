/**
 * Allowed Assign users, read-only from the "User ID Discord - Out Team" Google Sheet tab.
 * Uses the "Email Notion" column as the allowlist; an optional "ทีม" column gives the user's team.
 */
import { parseCSV } from "./csv";
import { TEAM_OPTIONS } from "./taskAssign";

const USERS_SHEET_ID = "1nHjuzBhl3cNjuAhVMzpylW5CQuT9PggzRsoNL-m0JXU";
const USERS_GID      = "1388053801";

export interface AllowedUser {
  /** display name: ชื่อเล่น, else global_name, else Username (from the sheet) */
  name?: string;
  /** team from the sheet's "ทีม" column, matched to a Task Team Creator option (undefined if blank/unknown) */
  team?: string;
}

export async function fetchAllowedUsers(): Promise<Map<string, AllowedUser>> {
  const url = `https://docs.google.com/spreadsheets/d/${USERS_SHEET_ID}/gviz/tq?tqx=out:csv&gid=${USERS_GID}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`users sheet ${res.status}`);
  const [headers, ...rows] = parseCSV(await res.text());
  if (!headers) throw new Error("users sheet empty");

  const emailIdx = headers.findIndex((h) => /^email/i.test(h.trim()));
  const teamIdx  = headers.findIndex((h) => /^(ทีม|team)$/i.test(h.trim()));
  const nickIdx  = headers.findIndex((h) => /^ชื่อเล่น$/.test(h.trim()));
  const globalIdx = headers.findIndex((h) => /^global_name$/i.test(h.trim()));
  const userIdx  = headers.findIndex((h) => /^username$/i.test(h.trim()));
  if (emailIdx < 0) throw new Error("users sheet has no Email column");

  const out = new Map<string, AllowedUser>();
  for (const r of rows) {
    const email = (r[emailIdx] ?? "").trim().toLowerCase();
    if (!email.includes("@")) continue;
    const rawTeam = teamIdx >= 0 ? (r[teamIdx] ?? "").trim().toLowerCase() : "";
    const team = TEAM_OPTIONS.find((t) => t.label.toLowerCase() === rawTeam)?.label;
    const cell = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    const name = cell(nickIdx) || cell(globalIdx) || cell(userIdx) || undefined;
    const prev = out.get(email);
    out.set(email, { team: team ?? prev?.team, name: name ?? prev?.name });
  }
  return out;
}

// ── Teams of each person, from the "User ID Notion - Out Team in Media" tab (the Notion member list) ──
const MEMBERS_GID = "445999363";

/**
 * Name prefixes used in Notion ("GP : Jenny", "DS M : Boss", …) → "Task Team Creator" labels.
 * An explicit "ทีม" column in the tab (labels, comma-separated) always wins over this guess.
 */
const PREFIX_TEAMS: Record<string, string[]> = {
  GP: ["GP"],
  AGX: ["AGX-Biz"],
  HOF: ["HOF"],
  BD: ["BD-CB"],
  MK: ["MKT-Performance"],
  DS: ["Design"],
  "DS M": ["Design"],
  DEV: ["Dev"],
  CDM: ["CDM"],
};

/** email (lower-case) → team labels this person belongs to ([] when it cannot be told) */
export async function fetchMemberTeams(): Promise<Map<string, string[]>> {
  const url = `https://docs.google.com/spreadsheets/d/${USERS_SHEET_ID}/gviz/tq?tqx=out:csv&gid=${MEMBERS_GID}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`members sheet ${res.status}`);
  const [headers, ...rows] = parseCSV(await res.text());
  if (!headers) return new Map();

  const emailIdx = headers.findIndex((h) => /^(อีเมล|email)/i.test(h.trim()));
  const teamIdx  = headers.findIndex((h) => /^(ทีม|team)$/i.test(h.trim()));
  const groupIdx = headers.findIndex((h) => /^กลุ่ม/.test(h.trim()));
  if (emailIdx < 0) return new Map();

  const known = new Map(TEAM_OPTIONS.map((t) => [t.label.toLowerCase(), t.label]));
  const out = new Map<string, string[]>();
  for (const r of rows) {
    const email = (r[emailIdx] ?? "").trim().toLowerCase();
    if (!email.includes("@")) continue;
    let teams: string[] = [];
    if (teamIdx >= 0 && (r[teamIdx] ?? "").trim()) {
      teams = r[teamIdx].split(/[,;/]/).map((x) => known.get(x.trim().toLowerCase())).filter((x): x is string => !!x);
    }
    if (teams.length === 0 && groupIdx >= 0) teams = PREFIX_TEAMS[(r[groupIdx] ?? "").trim().toUpperCase()] ?? [];
    out.set(email, [...new Set([...(out.get(email) ?? []), ...teams])]);
  }
  return out;
}
