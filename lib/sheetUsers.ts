/**
 * Allowed Assign users, read-only from the "User ID Discord - Out Team" Google Sheet tab.
 * Uses the "Email Notion" column as the allowlist; an optional "ทีม" column gives the user's team.
 */
import { parseCSV } from "./csv";
import { TEAM_OPTIONS } from "./taskAssign";

const USERS_SHEET_ID = "1nHjuzBhl3cNjuAhVMzpylW5CQuT9PggzRsoNL-m0JXU";
const USERS_GID      = "1388053801";

export interface AllowedUser {
  /** display name in the "ทีม : ชื่อ" form (see withTeamNames), else ชื่อเล่น / global_name / Username */
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
  return withTeamNames(out);
}

/** "GP:BEW", "💛GP  :  Bright" → "GP : BEW", "GP : Bright"; "" when the name has no "ทีม : ชื่อ" form */
function teamName(raw: string): string {
  const s = raw.replace(/^[^\p{L}\p{N}(\[]+/u, "").replace(/\s+/g, " ").trim();
  const i = s.indexOf(":");
  if (i <= 0) return "";
  const team = s.slice(0, i).trim(), name = s.slice(i + 1).trim();
  return team && name ? `${team} : ${name}` : "";
}

/** short team prefix used in names when nothing better is known */
const NAME_PREFIX: Record<string, string> = {
  GP: "GP", Commu: "GP", "MKT-Performance": "MK", SEO: "SEO", "AGX-Biz": "AGX", "AGX-GS": "AGX",
  "BD-CB": "BD", HOF: "HOF", Design: "DS", Content: "Content", Dev: "DEV", "BD-WangRuay": "WR", CDM: "CDM", Topfiar: "TF",
};

/**
 * Names everyone as "ทีม : ชื่อ" (e.g. "DS : Romram"), the form used for Notion people:
 * the Notion member list first, then the Discord server name, then team prefix + nickname.
 * Missing tabs only mean plainer names — never a failed sign-in.
 */
async function withTeamNames(users: Map<string, AllowedUser>): Promise<Map<string, AllowedUser>> {
  const tab = async (gid: string) => {
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${USERS_SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`, { cache: "no-store" });
    return res.ok ? parseCSV(await res.text()) : [];
  };
  const [notion, discord] = await Promise.all([tab(MEMBERS_GID).catch(() => []), tab(DISCORD_GID).catch(() => [])]);

  const names = (rows: string[][], emailRe: RegExp, nameRes: RegExp[]) => {
    const out = new Map<string, string>();
    const [h, ...body] = rows;
    if (!h) return out;
    const ei = h.findIndex((x) => emailRe.test(x.trim()));
    const nis = nameRes.map((re) => h.findIndex((x) => re.test(x.trim()))).filter((i) => i >= 0);
    if (ei < 0) return out;
    for (const r of body) {
      const e = (r[ei] ?? "").trim().toLowerCase();
      const n = nis.map((i) => teamName(r[i] ?? "")).find(Boolean);
      if (e.includes("@") && n && !out.has(e)) out.set(e, n);
    }
    return out;
  };
  const fromNotion = names(notion, /^(อีเมล|email)/i, [/^ชื่อ$/]);
  const fromDiscord = names(discord, /^(อีเมล|email)/i, [/^ชื่อในเซิร์ฟเวอร์$/, /^ชื่อที่แสดง$/]);
  const teams = new Map<string, string[]>();
  if (discord.length) for (const [e, t] of parseDiscordTeams(discord)) teams.set(e, t);

  for (const [email, u] of users) {
    const own = u.team ? [u.team] : briefTeamsFor(teams, email);
    const prefix = own.length ? NAME_PREFIX[own[0]] : undefined;
    const name = fromNotion.get(email) ?? fromDiscord.get(email) ?? (prefix && u.name ? `${prefix} : ${u.name}` : u.name);
    users.set(email, { ...u, name });
  }
  return users;
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

// ── Teams from the "[New] User ID Discord - Out Team" tab (Discord roles) ──
const DISCORD_GID = "1381351958";

/** Discord "ทีม" role → "Task Team Creator" labels. Roles not listed here (ECB, BD, CS, …) say nothing. */
const DISCORD_TEAMS: Record<string, string[]> = {
  agenix: ["AGX-Biz", "AGX-GS"],
  mkt: ["MKT-Performance"],
  "mkt sea": ["MKT-Performance"],
  seo: ["SEO"],
  hof: ["HOF"],
  "wang ruay": ["BD-WangRuay"],
  designer: ["Design"],
  "web dev": ["Dev"],
  content: ["Content"],
  "crit dmg": ["CDM"],
  bd: ["BD-CB"],
  "bd & commu": ["BD-CB"],
};

/** Prefix of the server name ("💜GP (Lead) : Jenny", "AGX : Ploy") → labels; used when the roles say nothing */
const NAME_PREFIX_TEAMS: Record<string, string[]> = {
  GP: ["GP", "Commu"], // GP and Commu share one credit pool
  SR: ["GP", "Commu"],
  PM: ["GP", "Commu"],
  AGX: ["AGX-Biz", "AGX-GS"],
  CDM: ["CDM"],
  BD: ["BD-CB"],
  BDSR: ["BD-CB"],
  AE: ["BD-CB"],
  MK: ["MKT-Performance"],
  DS: ["Design"],
  HOF: ["HOF"],
};

/** email (lower-case) → team labels this person may create briefs for ([] when it cannot be told) */
export async function fetchDiscordTeams(): Promise<Map<string, string[]>> {
  const url = `https://docs.google.com/spreadsheets/d/${USERS_SHEET_ID}/gviz/tq?tqx=out:csv&gid=${DISCORD_GID}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`discord sheet ${res.status}`);
  return parseDiscordTeams(parseCSV(await res.text()));
}

function parseDiscordTeams([headers, ...rows]: string[][]): Map<string, string[]> {
  if (!headers) return new Map();

  const col = (re: RegExp) => headers.findIndex((h) => re.test(h.trim()));
  const emailIdx = col(/^(อีเมล|email)/i);
  const teamIdx = col(/^(ทีม|team)$/i);
  const serverIdx = col(/^ชื่อในเซิร์ฟเวอร์$/);
  const displayIdx = col(/^ชื่อที่แสดง$/);
  if (emailIdx < 0) return new Map();

  const out = new Map<string, string[]>();
  for (const r of rows) {
    const email = (r[emailIdx] ?? "").trim().toLowerCase();
    if (!email.includes("@")) continue;
    let teams = (teamIdx >= 0 ? r[teamIdx] ?? "" : "").split(",").flatMap((t) => DISCORD_TEAMS[t.trim().toLowerCase()] ?? []);
    if (teams.length === 0) {
      const name = (serverIdx >= 0 && r[serverIdx]?.trim()) || (displayIdx >= 0 ? r[displayIdx] ?? "" : "");
      const prefix = name.includes(":") ? name.split(":")[0].replace(/^[^A-Za-z]+/, "").split(/[^A-Za-z]/)[0].toUpperCase() : "";
      teams = NAME_PREFIX_TEAMS[prefix] ?? [];
    }
    out.set(email, [...new Set([...(out.get(email) ?? []), ...teams])]);
  }
  return out;
}

/** Company e-mail domains that tell the team on their own (for people missing from the Discord tab) */
const EMAIL_DOMAIN_TEAMS: Record<string, string[]> = {
  "agenixteam.com": ["AGX-Biz", "AGX-GS"],
};

/** Teams of one person: their Discord entry, else their e-mail domain ([] when unknown) */
export function briefTeamsFor(discord: Map<string, string[]>, email: string): string[] {
  const e = email.trim().toLowerCase();
  const fromDiscord = discord.get(e) ?? [];
  return fromDiscord.length ? fromDiscord : EMAIL_DOMAIN_TEAMS[e.split("@")[1] ?? ""] ?? [];
}
