/**
 * Two-way sync with the "Credit Distribution" Google Sheet tab via Apps Script.
 *
 * Deploy the Apps Script at:
 *   Extensions › Apps Script › paste Code.gs › Deploy › New deployment
 *   Type: Web App | Execute as: Me | Access: Anyone
 * Copy the Web App URL → set NEXT_PUBLIC_DIST_SCRIPT_URL in .env.local
 */

const APPS_SCRIPT_URL = process.env.NEXT_PUBLIC_DIST_SCRIPT_URL ?? "";
const SHEET_ID = "1b1snrd3X-mM1lhoI_qOgEVX8UG49RKzhTXneFyeW4oY";

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

/** Fetch pct values for a given month from the sheet. Returns null if unavailable. */
export async function fetchDistFromSheet(
  year: number,
  month: number
): Promise<Record<string, number> | null> {
  if (!APPS_SCRIPT_URL) return null;
  try {
    const res = await fetch(
      `${APPS_SCRIPT_URL}?month=${year}-${month}`,
      { cache: "no-store" }
    );
    const rows: SheetDistRow[] = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return Object.fromEntries(rows.map((r) => [r.team_id, r.pct]));
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
    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      // Use text/plain to avoid CORS preflight; Apps Script reads e.postData.contents
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ month: `${year}-${month}`, teams }),
    });
    return true;
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
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Note%20Plan`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const rows = parseCSVRobust(await res.text());
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
    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "saveNote", month: `${year}-${month}`, note }),
    });
    return true;
  } catch {
    return false;
  }
}
