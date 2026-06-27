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

const TEAM_ICONS: Record<string, string> = {
  "MKT Performance":       "📊",
  "MKT Campaign TH":       "🇹🇭",
  "MKT Campaign SEA":      "🌏",
  "GP":                    "🎮",
  "GP(EXE)":               "🎮",
  "BD(CB)":                "💼",
  "BD(HOF)":               "🏆",
  "BD":                    "🎯",
  "AGX":                   "⚡",
  "CRI, Aztek, Topfiar":   "🎨",
  "Director&Manager&Edit": "🎬",
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
          <div className="flex flex-col gap-8 mb-6">
            {config.map((priority) => (
              <div key={priority.id}>
                {/* Priority header */}
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ background: priority.bgColor }} />
                  <p className="text-[11px] font-black uppercase tracking-widest"
                    style={{ color: priority.bgColor }}>
                    {priority.name}
                  </p>
                  <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                </div>

                {/* Companies */}
                <div className="flex flex-col gap-5">
                  {priority.companies.map((company) => {
                    const companyCredit = Math.round(
                      company.teams.reduce((s, t) => s + (t.pct / 100) * total, 0) * 100
                    ) / 100;
                    const companyPct = company.teams.reduce((s, t) => s + t.pct, 0);

                    return (
                      <div key={company.id}>
                        {/* Company subheader */}
                        <div className="flex items-center gap-2 mb-2.5">
                          <p className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded"
                            style={{ background: priority.bgColor + "22", color: priority.bgColor }}>
                            {company.name}
                          </p>
                          <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
                            {companyPct}% · {companyCredit.toLocaleString()} M Coin
                          </span>
                          <div className="flex-1 h-px" style={{ background: "var(--border)", opacity: 0.5 }} />
                        </div>

                        {/* Team cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3">
                          {company.teams.map((team) => {
                            const credit    = Math.round((team.pct / 100) * total * 100) / 100;
                            const used      = usage[team.summaryGroup]?.used  ?? 0;
                            const taskCount = usage[team.summaryGroup]?.count ?? 0;
                            const remaining = Math.max(0, credit - used);
                            const barWidth  = credit > 0 ? Math.round((remaining / credit) * 100) : 0;
                            const isEmpty   = used > 0 && credit > 0 && remaining === 0;
                            const isLow     = credit > 0 && barWidth <= 25 && used > 0;
                            const hasUsage  = used > 0;
                            const icon      = TEAM_ICONS[team.name] ?? "🏷️";

                            return (
                              <div key={team.id}
                                className="rounded-xl border p-3 sm:p-4 flex flex-col gap-2 transition-all hover:shadow-md"
                                style={{ background: "var(--bg-card)", borderColor: "var(--border)", opacity: isEmpty ? 0.5 : 1 }}>

                                {/* Icon + task badge */}
                                <div className="flex items-start justify-between">
                                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                                    style={{ background: "var(--accent-light)" }}>
                                    {icon}
                                  </div>
                                  <span className="text-[9px] font-black rounded-full px-1.5 py-0.5"
                                    style={{ background: "var(--bg-page)", color: "var(--text-muted)" }}>
                                    {taskCount > 0 ? `${taskCount} ชิ้น` : "—"}
                                  </span>
                                </div>

                                {/* Team name */}
                                <p className="text-[9px] font-black uppercase tracking-widest leading-tight"
                                  style={{ color: "var(--text-muted)" }}>
                                  {team.name}
                                </p>

                                {/* Credit / remaining */}
                                <div className="mt-auto">
                                  {hasUsage ? (
                                    <>
                                      <p className="text-[8px] font-black uppercase tracking-widest mb-0.5"
                                        style={{ color: isEmpty ? "#EF4444" : isLow ? "#F59E0B" : "var(--text-muted)" }}>
                                        {isEmpty ? "ใช้ครบแล้ว" : "คงเหลือ"}
                                      </p>
                                      <div className="flex items-end gap-0.5 mb-0.5">
                                        <span className="text-xl sm:text-2xl font-black leading-none"
                                          style={{ color: isEmpty ? "#EF4444" : isLow ? "#F59E0B" : "var(--accent)" }}>
                                          {isEmpty ? "0" : remaining.toLocaleString()}
                                        </span>
                                        <span className="text-[10px] font-semibold mb-0.5" style={{ color: "var(--text-muted)" }}>M</span>
                                      </div>
                                      <p className="text-[9px] mb-1.5" style={{ color: "var(--text-muted)" }}>
                                        ทั้งหมด {credit} · ใช้ {used}
                                      </p>
                                    </>
                                  ) : (
                                    <>
                                      <p className="text-[8px] font-black uppercase tracking-widest mb-0.5"
                                        style={{ color: "var(--text-muted)" }}>เครดิต</p>
                                      <div className="flex items-end gap-0.5 mb-1.5">
                                        <span className="text-xl sm:text-2xl font-black leading-none"
                                          style={{ color: credit > 0 ? "var(--accent)" : "var(--text-muted)" }}>
                                          {credit > 0 ? credit.toLocaleString() : "—"}
                                        </span>
                                        {credit > 0 && (
                                          <span className="text-[10px] font-semibold mb-0.5" style={{ color: "var(--text-muted)" }}>M</span>
                                        )}
                                      </div>
                                    </>
                                  )}

                                  {/* Bar */}
                                  <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                                    <div className="h-full rounded-full transition-all duration-700"
                                      style={{
                                        width: hasUsage ? `${barWidth}%` : "100%",
                                        background: isEmpty ? "#EF4444" : isLow ? "#F59E0B" : priority.bgColor,
                                        opacity: credit > 0 ? 1 : 0,
                                      }} />
                                  </div>
                                  <div className="flex justify-between mt-0.5">
                                    <span className="text-[8px]" style={{ color: "var(--text-muted)" }}>0</span>
                                    <span className="text-[8px] font-bold" style={{ color: priority.bgColor }}>{team.pct}%</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
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
