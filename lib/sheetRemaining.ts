/**
 * One-way export of the Dashboard's "remaining credit" snapshot to the
 * "Remaining" Google Sheet tab via the same Apps Script web app used by
 * lib/sheetDistribution.ts. See lib/Code.gs for the doPost handler.
 */
import { callScript } from "./scriptApi";

const APPS_SCRIPT_URL = process.env.NEXT_PUBLIC_DIST_SCRIPT_URL ?? "";

export interface RemainingRow {
  priority: string;
  company: string;
  team: string;
  credit: number;
  used: number;
  remaining: number;
  remainingPct: number;
  taskCount: number;
}

/** Push the current remaining-credit table for a given month. Replaces any existing rows for that month. */
export async function saveRemainingToSheet(
  year: number,
  month: number,
  rows: RemainingRow[]
): Promise<boolean> {
  if (!APPS_SCRIPT_URL) return true;
  try {
    const r = await callScript<{ ok?: boolean }>({ action: "saveRemaining", month: `${year}-${month}`, rows });
    return r.ok === true;
  } catch {
    return false;
  }
}
