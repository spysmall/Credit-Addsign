/**
 * Two-way sync with the "Credit Distribution" Google Sheet tab via Apps Script.
 *
 * Deploy the Apps Script at:
 *   Extensions › Apps Script › paste Code.gs › Deploy › New deployment
 *   Type: Web App | Execute as: Me | Access: Anyone
 * Copy the Web App URL → set NEXT_PUBLIC_DIST_SCRIPT_URL in .env.local
 */

const APPS_SCRIPT_URL = process.env.NEXT_PUBLIC_DIST_SCRIPT_URL ?? "";

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
  if (!APPS_SCRIPT_URL) return false;
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
