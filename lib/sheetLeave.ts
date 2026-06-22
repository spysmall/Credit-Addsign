import { TEAM_MEMBERS } from "@/lib/team";

const SHEET_ID = "1jIzyt15EL5DaODqTG-e7D2pSWbsqETG6gsq60yhR_zY";

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split('","').map((c) => c.replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const cols = line.split('","').map((c) => c.replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cols[i] ?? ""));
    return row;
  });
}

export async function fetchLeaveHours(
  year: number,
  month: number
): Promise<Record<string, number>> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=leave`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();

  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const rows = parseCSV(text);
  const result: Record<string, number> = {};

  for (const row of rows) {
    if (row["ทีม"] !== "Media") continue;
    if (!row["เริ่ม"]?.startsWith(monthPrefix)) continue;

    const nickname = row["ผู้ยื่น"]?.trim();
    const member = TEAM_MEMBERS.find((m) => m.nickname === nickname);
    if (!member) continue;

    const days = parseFloat(row["จำนวน"]) || 0;
    result[member.id] = (result[member.id] ?? 0) + days * 8;
  }

  return result;
}
