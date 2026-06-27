"use client";

import { useState, useEffect } from "react";
import MonthSelector from "@/components/MonthSelector";
import { loadDistConfig, DistConfig } from "@/lib/distribution";
import { getWorkdayInfo, hoursToCredits } from "@/lib/workdays";
import { TEAM_MEMBERS } from "@/lib/team";
import { fetchDistFromSheet } from "@/lib/sheetDistribution";
import { fetchAllTaskUsage, TeamUsage } from "@/lib/sheetTasks";

const THAI_MONTHS_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

function teamTotalCredits(y: number, m: number): number {
  const info = getWorkdayInfo(y, m);
  const active = TEAM_MEMBERS.filter((mem) => !mem.excludeFromCredits);
  return active.reduce((sum, mem) => {
    const hrs = mem.isLead ? (mem.customHoursPerMonth ?? info.workingHours) : info.workingHours;
    return sum + hoursToCredits(hrs);
  }, 0);
}

const COMPANY_ICONS: Record<string, string> = {
  "CB":                     "💎",
  "EXE":                    "⚙️",
  "HOF":                    "🏆",
  "AGX,iHAVEFiLM":          "⚡",
  "Wang Ruay":               "🎯",
  "CRI, Aztek, Topfiar":    "🎨",
  "Director&Manager&Edit":  "🎬",
};

export default function DashboardPage() {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [config, setConfig]   = useState<DistConfig>([]);
  const [usage, setUsage]     = useState<Record<string, TeamUsage>>({});
  const [loading, setLoading] = useState(true);

  const buddhist = year + 543;
  const total = teamTotalCredits(year, month);

  useEffect(() => {
    setLoading(true);
    setUsage({});

    fetchDistFromSheet(year, month)
      .then((sheetMap) => {
        const base = loadDistConfig(year, month);
        const merged = sheetMap
          ? base.map((p) => ({
              ...p,
              companies: p.companies.map((c) => ({
                ...c,
                teams: c.teams.map((t) =>
                  sheetMap[t.id] !== undefined ? { ...t, pct: sheetMap[t.id] } : t
                ),
              })),
            }))
          : base;
        setConfig(merged);
      })
      .catch(() => setConfig(loadDistConfig(year, month)))
      .finally(() => setLoading(false));

    // Fetch actual usage for this month from task sheet
    fetchAllTaskUsage(year, month).then(setUsage).catch(() => {});
  }, [year, month, total]);

  const totalUsed  = Object.values(usage).reduce((s, v) => s + v.used, 0);
  const totalAlloc = config.flatMap(p => p.companies).flatMap(c => c.teams)
    .reduce((s, t) => s + (t.pct / 100) * total, 0);

  return (
    <div style={{ background: "var(--bg-page)", minHeight: "calc(100vh - 56px)" }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

        {/* ── Header ── */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-start justify-between gap-4 mb-3 sm:mb-4">
            <p className="text-xs font-black uppercase tracking-[0.15em] pt-1"
              style={{ color: "var(--accent)" }}>Dashboard · เครดิตประจำเดือน</p>
            <MonthSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black leading-none tracking-tight"
            style={{ color: "var(--text-primary)" }}>
            {THAI_MONTHS_SHORT[month - 1]}{" "}
            <span style={{ color: "var(--accent)" }}>{buddhist}</span>
          </h1>
          <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
            เครดิต M Coin ที่แต่ละทีมได้รับสำหรับเดือนนี้
          </p>
        </div>

        {/* ── Total hero ── */}
        <div className="rounded-2xl p-5 sm:p-6 mb-6 flex items-center justify-between gap-4 overflow-hidden relative"
          style={{ background: "var(--bg-dark)" }}>
          <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full opacity-10" style={{ background: "var(--accent)" }} />
          <div className="absolute -right-2 bottom-0 w-48 h-48 rounded-full opacity-5" style={{ background: "var(--accent)" }} />
          <div className="relative">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>
              เครดิตรวมทั้งทีม
            </p>
            <div className="flex items-end gap-2">
              <span className="text-4xl sm:text-5xl font-black text-white leading-none">{total}</span>
              <span className="text-base font-bold mb-1" style={{ color: "rgba(255,255,255,0.6)" }}>M Coin</span>
            </div>
            <p className="text-xs mt-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>
              {THAI_MONTHS_SHORT[month - 1]} {buddhist} · {TEAM_MEMBERS.filter(m => !m.excludeFromCredits).length} คน
              {totalUsed > 0 && (
                <span style={{ color: "var(--accent)" }}> · ใช้ไปแล้ว {totalUsed.toLocaleString()} M Coin</span>
              )}
            </p>
          </div>
          <div className="relative shrink-0 hidden sm:block">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
              style={{ background: "var(--accent)" }}>
              💰
            </div>
          </div>
        </div>

        {/* ── Priority sections → Company cards ── */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="rounded-2xl border p-4 sm:p-5 animate-pulse"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)", minHeight: 140 }}>
                <div className="w-8 h-8 rounded-xl mb-3" style={{ background: "var(--border)" }} />
                <div className="w-3/4 h-3 rounded mb-2" style={{ background: "var(--border)" }} />
                <div className="w-1/2 h-8 rounded" style={{ background: "var(--border)" }} />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-6 mb-6">
            {config.map((priority) => (
              <div key={priority.id}>
                {/* Priority header */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-2 w-2 rounded-full" style={{ background: priority.bgColor }} />
                  <p className="text-[10px] font-black uppercase tracking-widest"
                    style={{ color: priority.bgColor }}>
                    {priority.name}
                  </p>
                  <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                </div>

                {/* Company cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {priority.companies.map((company) => {
                    const credit = Math.round(
                      company.teams.reduce((s, t) => s + (t.pct / 100) * total, 0) * 100
                    ) / 100;
                    const pctSum = company.teams.reduce((s, t) => s + t.pct, 0);

                    // Sum usage from unique summaryGroups in this company
                    const seenGroups = new Set<string>();
                    let companyUsed  = 0;
                    let companyCount = 0;
                    for (const t of company.teams) {
                      if (!seenGroups.has(t.summaryGroup)) {
                        seenGroups.add(t.summaryGroup);
                        companyUsed  += usage[t.summaryGroup]?.used  ?? 0;
                        companyCount += usage[t.summaryGroup]?.count ?? 0;
                      }
                    }
                    // Only show usage if this company's summaryGroups are exclusive to it
                    // (i.e., no other company in any priority shares the same summaryGroup)
                    const allGroups = config.flatMap(p => p.companies.flatMap(c => c.teams.map(t => ({ cid: c.id, sg: t.summaryGroup }))));
                    const isExclusive = [...seenGroups].every(sg =>
                      allGroups.filter(x => x.sg === sg).every(x => x.cid === company.id)
                    );

                    const remaining = Math.max(0, credit - companyUsed);
                    const barWidth  = credit > 0 ? Math.round((remaining / credit) * 100) : 0;
                    const isEmpty   = isExclusive && companyUsed > 0 && credit > 0 && remaining === 0;
                    const isLow     = isExclusive && credit > 0 && barWidth <= 25 && companyUsed > 0;
                    const hasUsage  = isExclusive && companyUsed > 0;
                    const icon      = COMPANY_ICONS[company.name] ?? "🏢";

                    return (
                      <div key={company.id}
                        className="rounded-2xl border p-4 sm:p-5 flex flex-col gap-2 transition-all hover:shadow-md"
                        style={{ background: "var(--bg-card)", borderColor: "var(--border)", opacity: isEmpty ? 0.5 : 1 }}>

                        {/* Icon + task count badge */}
                        <div className="flex items-start justify-between">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                            style={{ background: "var(--accent-light)" }}>
                            {icon}
                          </div>
                          <span className="text-[10px] font-black rounded-full px-2 py-0.5"
                            style={{ background: "var(--bg-page)", color: "var(--text-muted)" }}>
                            {companyCount > 0 ? `${companyCount} ชิ้น` : "—"}
                          </span>
                        </div>

                        {/* Company name */}
                        <p className="text-[10px] font-black uppercase tracking-widest leading-tight"
                          style={{ color: "var(--text-muted)" }}>
                          {company.name}
                        </p>

                        {/* Teams list */}
                        <p className="text-[9px] leading-relaxed" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
                          {company.teams.map(t => t.name).join(" · ")}
                        </p>

                        {/* Credit */}
                        <div className="mt-auto">
                          {hasUsage ? (
                            <>
                              <p className="text-[9px] font-black uppercase tracking-widest mb-0.5"
                                style={{ color: isEmpty ? "#EF4444" : isLow ? "#F59E0B" : "var(--text-muted)" }}>
                                {isEmpty ? "ใช้ครบแล้ว" : "คงเหลือ"}
                              </p>
                              <div className="flex items-end gap-1 mb-0.5">
                                <span className="text-2xl sm:text-3xl font-black leading-none"
                                  style={{ color: isEmpty ? "#EF4444" : isLow ? "#F59E0B" : "var(--accent)" }}>
                                  {isEmpty ? "0" : remaining.toLocaleString()}
                                </span>
                                <span className="text-xs font-semibold mb-0.5" style={{ color: "var(--text-muted)" }}>M Coin</span>
                              </div>
                              <p className="text-[10px] mb-2" style={{ color: "var(--text-muted)" }}>
                                เครดิตทั้งหมด {credit.toLocaleString()} · ใช้ {companyUsed.toLocaleString()}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-[9px] font-black uppercase tracking-widest mb-0.5"
                                style={{ color: "var(--text-muted)" }}>เครดิตทั้งหมด</p>
                              <div className="flex items-end gap-1 mb-2">
                                <span className="text-2xl sm:text-3xl font-black leading-none"
                                  style={{ color: credit > 0 ? "var(--accent)" : "var(--text-muted)" }}>
                                  {credit > 0 ? credit.toLocaleString() : "—"}
                                </span>
                                {credit > 0 && (
                                  <span className="text-xs font-semibold mb-0.5" style={{ color: "var(--text-muted)" }}>M Coin</span>
                                )}
                              </div>
                            </>
                          )}

                          {/* % badge + bar */}
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>0</span>
                            <span className="text-[9px] font-bold" style={{ color: priority.bgColor }}>{pctSum}%</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                            <div className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: hasUsage ? `${barWidth}%` : "100%",
                                background: isEmpty ? "#EF4444" : isLow ? "#F59E0B" : priority.bgColor,
                                opacity: credit > 0 ? 1 : 0,
                              }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <p className="text-[10px] mt-2 text-center" style={{ color: "var(--text-muted)" }}>
          เครดิตคำนวณจาก % ที่จัดสรรใน Credit Distribution · ใช้ไปจาก [sum] All Task(in Notion)
        </p>
      </div>
    </div>
  );
}
