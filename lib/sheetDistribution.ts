/**
 * Two-way sync with the "Credit Distribution" Google Sheet tab via Apps Script.
 *
 * Deploy the Apps Script at:
 *   Extensions › Apps Script › paste Code.gs › Deploy › New deployment
 *   Type: Web App | Execute as: Me | Access: Anyone
 * Copy the Web App URL → set NEXT_PUBLIC_DIST_SCRIPT_URL in .env.local
 */
import { callScript, fetchSheetCsv, forgetSheet } from "./scriptApi";

const APPS_SCRIPT_URL = process.env.NEXT_PUBLIC_DIST_SCRIPT_URL ?? "";

/** RFC-4180 CSV parser — handles quoted fields with embedded newlines/commas */
function parseCSVRobust(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cell += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(cell); cell = ""; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (ch === '\r') { /* skip */ }
      else { cell += ch; }
    }
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.slice(1); // skip header row
}

export interface SheetDistRow {
  team_id: string;
  pct: number;
}

/** Fetch pct values for a given month from the sheet via public CSV (no CORS issues). */
export async function fetchDistFromSheet(
  year: number,
  month: number
): Promise<Record<string, number> | null> {
  const monthKey = `${year}-${month}`;
  try {
    const rows = parseCSVRobust(await fetchSheetCsv("dist"));
    // Each row: [month, team_id, pct, updated_at]
    const matched = rows.filter((r) => r[0] === monthKey);
    if (matched.length === 0) return null;
    return Object.fromEntries(matched.map((r) => [r[1], parseFloat(r[2]) || 0]));
  } catch {
    return null;
  }
}

/** Write all team pct values for a given month to the sheet. */
export async function saveDistToSheet(
  year: number,
  month: number,
  teams: { id: string; pct: number }[]
): Promise<boolean> {
  // No Apps Script URL configured → localStorage-only mode, treat as success
  if (!APPS_SCRIPT_URL) return true;
  try {
    const r = await callScript<{ ok?: boolean }>({ month: `${year}-${month}`, teams });
    forgetSheet("dist");
    return r.ok === true;
  } catch {
    return false;
  }
}

/** Flatten a DistConfig into a flat array of {id, pct} for sheet writing */
export function flattenConfig(config: import("./distribution").DistConfig) {
  return config.flatMap((p) =>
    p.companies.flatMap((c) => c.teams.map((t) => ({ id: t.id, pct: t.pct })))
  );
}

/** Fetch note text for a given month from the 'Note Plan' sheet tab.
 *  Strategy A: Apps Script URL (read+write)
 *  Strategy B: public CSV endpoint (read-only fallback)
 */
export async function fetchNoteFromSheet(
  year: number,
  month: number
): Promise<string | null> {
  const monthKey = `${year}-${month}`;

  // Always read via public CSV — gets the latest row correctly
  try {
    const rows = parseCSVRobust(await fetchSheetCsv("note"));
    const match = rows.filter((r) => r[0] === monthKey).pop();
    return match ? match[1] ?? "" : null;
  } catch {
    return null;
  }
}

/** Write note text for a given month to the 'Note Plan' sheet tab. */
export async function saveNoteToSheet(
  year: number,
  month: number,
  note: string
): Promise<boolean> {
  if (!APPS_SCRIPT_URL) return true;
  try {
    const r = await callScript<{ ok?: boolean }>({ action: "saveNote", month: `${year}-${month}`, note });
    forgetSheet("note");
    return r.ok === true;
  } catch {
    return false;
  }
}
