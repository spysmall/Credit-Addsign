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
  "mkt performance":           "MKT Performance",
  "mkt perf":                  "MKT Performance",
  "mkt campaign th":           "MKT Campaign TH",
  "mkt campaign sea":          "MKT Campaign SEA",
  "gp":                        "GP",
  "gp(exe)":                   "GP",
  "bd(cb)":                    "BD(CB)",
  "bd(hof)":                   "BD(HOF)",
  "agx":                       "AGX",
  "wr":                        "WR",
  "wang ruay":                 "WR",
  "cri, aztek, topfiar":       "CRI, Aztek, Topfiar",
  "cri":                       "CRI, Aztek, Topfiar",
  "director&manager&edit":     "Director&Manager&Edit",
  "director & manager & edit": "Director&Manager&Edit",
  "director":                  "Director&Manager&Edit",
};

function normalizeGroup(raw: string): string | null {
  const key = raw.toLowerCase().trim();
  return ALIAS[key] ?? null;
}

export interface TeamUsage {
  used: number;
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
      if (!result[group]) result[group] = { used: 0 };
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
      if (!result[group]) result[group] = { used: 0 };
      result[group].used = Math.round((result[group].used + credits) * 100) / 100;
    }
    return result;
  }

  return {};
}
