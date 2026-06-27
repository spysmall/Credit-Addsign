const SHEET_ID = "1b1snrd3X-mM1lhoI_qOgEVX8UG49RKzhTXneFyeW4oY";
const GID      = "1206331278";

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split('","').map((c) => c.replace(/^"|"$/g, "").trim());
  return lines.slice(1).map((line) => {
    const cols = line.split('","').map((c) => c.replace(/^"|"$/g, "").trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cols[i] ?? ""));
    return row;
  });
}

// Maps display team names / aliases to our summaryGroup keys
const ALIAS: Record<string, string> = {
  // MKT Performance
  "mkt performance":           "MKT Performance",
  "mkt perf":                  "MKT Performance",
  "mkt-perf":                  "MKT Performance",
  "mkt-performance":           "MKT Performance",

  // MKT Campaign TH
  "mkt campaign th":           "MKT Campaign TH",
  "mkt-th":                    "MKT Campaign TH",

  // MKT Campaign SEA
  "mkt campaign sea":          "MKT Campaign SEA",
  "mkt-sea":                   "MKT Campaign SEA",

  // GP
  "gp":                        "GP",
  "gp(exe)":                   "GP",

  // BD(CB)
  "bd(cb)":                    "BD(CB)",
  "bd-cb":                     "BD(CB)",

  // BD(HOF)
  "bd(hof)":                   "BD(HOF)",
  "hof":                       "BD(HOF)",

  // AGX
  "agx":                       "AGX",
  "agx-gs":                    "AGX",
  "agx-biz":                   "AGX",

  // WR
  "wr":                        "WR",
  "wang ruay":                 "WR",
  "bd-wangruay":               "WR",

  // CRI, Aztek, Topfiar
  "cri, aztek, topfiar":       "CRI, Aztek, Topfiar",
  "cri":                       "CRI, Aztek, Topfiar",
  "cdm":                       "CRI, Aztek, Topfiar",

  // Director&Manager&Edit
  "director&manager&edit":     "Director&Manager&Edit",
  "director & manager & edit": "Director&Manager&Edit",
  "director":                  "Director&Manager&Edit",
  "design":                    "Director&Manager&Edit",
};

function normalizeGroup(raw: string): string | null {
  const key = raw.toLowerCase().trim();
  return ALIAS[key] ?? null;
}

export interface TeamUsage {
  used: number;
  count: number;
}

/**
 * Fetch credit usage from '[sum] All Task(in Notion)' tab.
 * Aggregates by team name across all companies for a given month.
 * Date format in sheet: M/D/YYYY (e.g. "7/1/2026")
 */
export async function fetchAllTaskUsage(
  year: number,
  month: number
): Promise<Record<string, TeamUsage>> {
  const tabName = encodeURIComponent("[sum] All Task(in Notion)");
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${tabName}`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();

  // RFC-4180 parser (handles quoted fields with embedded newlines)
  const allRows: string[][] = [];
  let row: string[] = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { cell += ch; }
    } else {
      if (ch === '"') { inQ = true; }
      else if (ch === ',') { row.push(cell); cell = ""; }
      else if (ch === '\n') { row.push(cell); allRows.push(row); row = []; cell = ""; }
      else if (ch !== '\r') { cell += ch; }
    }
  }
  if (cell || row.length) { row.push(cell); allRows.push(row); }

  const [headers, ...rows] = allRows;
  if (!headers) return {};

  // Detect columns by header name
  const teamIdx   = headers.findIndex((h) => /ทีม/i.test(h));
  const creditIdx = headers.findIndex((h) => /เครดิต|credit/i.test(h));
  const dateIdx   = headers.findIndex((h) => /วันที่|date/i.test(h));
  if (teamIdx < 0 || creditIdx < 0) return {};

  const result: Record<string, TeamUsage> = {};

  for (const r of rows) {
    // Filter by month if date column exists (format: M/D/YYYY or MM/DD/YYYY)
    if (dateIdx >= 0) {
      const dateStr = r[dateIdx] ?? "";
      const parts = dateStr.split("/");
      if (parts.length < 3) continue;
      const rowMonth = parseInt(parts[0], 10);
      const rowYear  = parseInt(parts[2], 10);
      if (rowYear !== year || rowMonth !== month) continue;
    }

    const rawTeam = (r[teamIdx] ?? "").trim();
    const group   = normalizeGroup(rawTeam) ?? rawTeam; // fallback: use name as-is
    if (!group) continue;

    const credits = parseFloat(r[creditIdx] ?? "0") || 0;
    if (!result[group]) result[group] = { used: 0, count: 0 };
    result[group].used  = Math.round((result[group].used + credits) * 100) / 100;
    result[group].count += 1;
  }

  return result;
}

export async function fetchTaskUsage(
  year: number,
  month: number
): Promise<Record<string, TeamUsage>> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();

  const rows = parseCSV(text);
  if (rows.length === 0) return {};

  const result: Record<string, TeamUsage> = {};

  // Detect structure: look for a "Team" or "Department" column + month/date column + credit column
  const sampleHeaders = Object.keys(rows[0]);

  // --- Strategy A: row-per-task (has team col + date/month col + credit col) ---
  const teamCol  = sampleHeaders.find((h) => /team|dept|department|ทีม|สาย/i.test(h));
  const creditCol = sampleHeaders.find((h) => /credit|เครดิต|coin|m.?coin/i.test(h));
  const dateCol  = sampleHeaders.find((h) => /date|วันที่|month|เดือน|start/i.test(h));

  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  // Thai month short names mapping
  const THAI_MONTH_SHORT = ["","ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  const THAI_MONTH_FULL  = ["","มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  const EN_MONTHS = ["","jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

  if (teamCol && creditCol) {
    for (const row of rows) {
      const rawTeam = row[teamCol] ?? "";
      const group = normalizeGroup(rawTeam);
      if (!group) continue;

      // Filter by month if a date column exists
      if (dateCol) {
        const dateVal = (row[dateCol] ?? "").toLowerCase();
        const inMonth =
          dateVal.startsWith(monthPrefix) ||
          dateVal.includes(THAI_MONTH_SHORT[month]) ||
          dateVal.includes(THAI_MONTH_FULL[month]) ||
          dateVal.includes(EN_MONTHS[month]);
        if (!inMonth) continue;
      }

      const credits = parseFloat(row[creditCol] ?? "0") || 0;
      if (!result[group]) result[group] = { used: 0, count: 0 };
      result[group].used = Math.round((result[group].used + credits) * 100) / 100;
    }
    return result;
  }

  // --- Strategy B: pivot table — teams as rows, months as columns ---
  // Headers look like: ["Team", "พ.ค.", "มิ.ย.", ...] or ["Team", "May", "Jun", ...]
  // Find the column matching the requested month
  const monthColCandidates = [
    THAI_MONTH_SHORT[month].replace(".", ""),
    THAI_MONTH_SHORT[month],
    THAI_MONTH_FULL[month],
    EN_MONTHS[month].charAt(0).toUpperCase() + EN_MONTHS[month].slice(1),
    String(month),
    monthPrefix,
  ];

  const monthColKey = sampleHeaders.find((h) =>
    monthColCandidates.some((c) => h.toLowerCase().includes(c.toLowerCase()))
  );

  if (monthColKey) {
    // First column assumed to be team name
    const firstCol = sampleHeaders[0];
    for (const row of rows) {
      const rawTeam = row[firstCol] ?? "";
      const group = normalizeGroup(rawTeam);
      if (!group) continue;
      const credits = parseFloat(row[monthColKey] ?? "0") || 0;
      if (!result[group]) result[group] = { used: 0, count: 0 };
      result[group].used = Math.round((result[group].used + credits) * 100) / 100;
    }
    return result;
  }

  return {};
}
