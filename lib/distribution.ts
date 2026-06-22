export interface DistTeam {
  id: string;
  name: string;
  summaryGroup: string; // aggregated in right-panel summary
  pct: number;          // direct % of total credit pool
}

export interface DistCompany {
  id: string;
  name: string;
  teams: DistTeam[];
}

export interface DistPriority {
  id: string;
  name: string;
  bgColor: string;
  textColor: string;
  companies: DistCompany[];
}

export type DistConfig = DistPriority[];

export const DEFAULT_DIST_CONFIG: DistConfig = [
  {
    id: "high",
    name: "Priority : High",
    bgColor: "#E8511E",
    textColor: "#fff",
    companies: [
      {
        id: "cb",
        name: "CB",
        teams: [
          { id: "cb-mkt-perf",  name: "MKT Performance",  summaryGroup: "MKT Performance",        pct: 8  },
          { id: "cb-mkt-th",    name: "MKT Campaign TH",   summaryGroup: "MKT Campaign TH",        pct: 1  },
          { id: "cb-mkt-sea",   name: "MKT Campaign SEA",  summaryGroup: "MKT Campaign SEA",       pct: 6  },
          { id: "cb-gp",        name: "GP",                summaryGroup: "GP",                     pct: 13 },
          { id: "cb-bd",        name: "BD(CB)",             summaryGroup: "BD(CB)",                 pct: 2  },
        ],
      },
      {
        id: "exe",
        name: "EXE",
        teams: [
          { id: "exe-mkt-perf", name: "MKT Performance",  summaryGroup: "MKT Performance",        pct: 8  },
          { id: "exe-mkt-th",   name: "MKT Campaign TH",   summaryGroup: "MKT Campaign TH",        pct: 1  },
          { id: "exe-gp",       name: "GP(EXE)",           summaryGroup: "GP",                     pct: 5  },
        ],
      },
      {
        id: "hof",
        name: "HOF",
        teams: [
          { id: "hof-mkt-perf", name: "MKT Performance",  summaryGroup: "MKT Performance",        pct: 15 },
          { id: "hof-mkt-th",   name: "MKT Campaign TH",   summaryGroup: "MKT Campaign TH",        pct: 5  },
          { id: "hof-gp",       name: "GP",                summaryGroup: "GP",                     pct: 14 },
          { id: "hof-bd",       name: "BD(HOF)",            summaryGroup: "BD(HOF)",                pct: 7  },
        ],
      },
      {
        id: "agx",
        name: "AGX,iHAVEFiLM",
        teams: [
          { id: "agx-agx",      name: "AGX",               summaryGroup: "AGX",                    pct: 10 },
        ],
      },
      {
        id: "wr",
        name: "Wang Ruay",
        teams: [
          { id: "wr-bd",        name: "BD",                summaryGroup: "WR",                     pct: 1  },
        ],
      },
    ],
  },
  {
    id: "normal",
    name: "Priority : Normal",
    bgColor: "#6B8CFF",
    textColor: "#fff",
    companies: [
      {
        id: "cri",
        name: "CRI, Aztek, Topfiar",
        teams: [
          { id: "cri-all",      name: "CRI, Aztek, Topfiar", summaryGroup: "CRI, Aztek, Topfiar", pct: 1  },
        ],
      },
    ],
  },
  {
    id: "team_head",
    name: "Team Head&Worst case",
    bgColor: "#C0799A",
    textColor: "#fff",
    companies: [
      {
        id: "dir",
        name: "Director&Manager&Edit",
        teams: [
          { id: "dir-all",      name: "Director&Manager&Edit", summaryGroup: "Director&Manager&Edit", pct: 3 },
        ],
      },
    ],
  },
];

const STORAGE_KEY = (y: number, m: number) => `credit-dist-v1-${y}-${m}`;

export function loadDistConfig(year: number, month: number): DistConfig {
  if (typeof window === "undefined") return DEFAULT_DIST_CONFIG;

  const stored = localStorage.getItem(STORAGE_KEY(year, month));
  if (stored) {
    try { return JSON.parse(stored) as DistConfig; } catch { /* fall through */ }
  }

  // Fallback to previous month's config
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear  = month === 1 ? year - 1 : year;
  const prevStored = localStorage.getItem(STORAGE_KEY(prevYear, prevMonth));
  if (prevStored) {
    try { return JSON.parse(prevStored) as DistConfig; } catch { /* fall through */ }
  }

  return DEFAULT_DIST_CONFIG;
}

export function saveDistConfig(year: number, month: number, config: DistConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY(year, month), JSON.stringify(config));
}

export function totalPct(config: DistConfig): number {
  return config.flatMap((p) => p.companies.flatMap((c) => c.teams)).reduce((s, t) => s + t.pct, 0);
}

// Aggregate credits per summaryGroup
export function computeSummaryCredits(config: DistConfig, totalCredits: number): Record<string, number> {
  const result: Record<string, number> = {};
  for (const priority of config) {
    for (const company of priority.companies) {
      for (const team of company.teams) {
        const credits = Math.round((team.pct / 100) * totalCredits * 100) / 100;
        result[team.summaryGroup] = Math.round(((result[team.summaryGroup] ?? 0) + credits) * 100) / 100;
      }
    }
  }
  return result;
}

// Ordered unique summary groups
export function getSummaryGroups(config: DistConfig): string[] {
  const seen = new Set<string>();
  const groups: string[] = [];
  for (const priority of config) {
    for (const company of priority.companies) {
      for (const team of company.teams) {
        if (!seen.has(team.summaryGroup)) {
          seen.add(team.summaryGroup);
          groups.push(team.summaryGroup);
        }
      }
    }
  }
  return groups;
}
