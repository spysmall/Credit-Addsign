"use client";

import React, { useState, useEffect } from "react";
import MonthSelector from "@/components/MonthSelector";
import { loadDistConfig, DistConfig } from "@/lib/distribution";
import { getWorkdayInfo, hoursToCredits } from "@/lib/workdays";
import { TEAM_MEMBERS } from "@/lib/team";
import { fetchDistFromSheet } from "@/lib/sheetDistribution";
import { fetchAllTaskUsage, TeamUsage } from "@/lib/sheetTasks";
import { saveRemainingToSheet, RemainingRow } from "@/lib/sheetRemaining";

const THAI_MONTHS_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

function teamTotalCredits(y: number, m: number): number {
  const info = getWorkdayInfo(y, m);
  const active = TEAM_MEMBERS.filter((mem) => !mem.excludeFromCredits);
  return active.reduce((sum, mem) => {
    const hrs = mem.isLead ? (mem.customHoursPerMonth ?? info.workingHours) : info.workingHours;
    return sum + hoursToCredits(hrs);
  }, 0);
}

function IconChart() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
      <path d="M2 11a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-5ZM8 7a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V7ZM14 4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V4Z"/>
    </svg>
  );
}
function IconFlag() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
      <path d="M3.5 2.75a.75.75 0 0 0-1.5 0v14.5a.75.75 0 0 0 1.5 0v-4.392l1.657-.348a6.449 6.449 0 0 1 4.271.572 7.948 7.948 0 0 0 5.965.524l2.078-.64A.75.75 0 0 0 18 12.25v-8.5a.75.75 0 0 0-.904-.734l-2.38.501a7.25 7.25 0 0 1-4.186-.363l-.502-.2a8.75 8.75 0 0 0-5.053-.439L3.5 3.16V2.75Z"/>
    </svg>
  );
}
function IconGlobe() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
      <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm-1.547-8.459c.21-.248.472-.543.795-.83.664-.592 1.57-1.175 2.752-1.175a3.25 3.25 0 0 1 3.25 3.25c0 1.307-.78 2.276-1.654 2.928-.873.652-1.95 1.036-2.846 1.036-.924 0-1.717-.427-2.25-.852l-.023-.018c.16-.38.258-.78.27-1.173a3.28 3.28 0 0 1-.294-.166ZM6.75 9.5a.75.75 0 0 0 0 1.5h.5a.75.75 0 0 0 0-1.5h-.5Z" clipRule="evenodd"/>
    </svg>
  );
}
function IconGamepad() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
      <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3A1.5 1.5 0 0 1 13 3.5V4h-1.5v-.5h-3V4H7v-.5ZM3 7.5A1.5 1.5 0 0 1 4.5 6h11A1.5 1.5 0 0 1 17 7.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5v-7ZM8 9a.75.75 0 0 0-.75.75v.5h-.5a.75.75 0 0 0 0 1.5h.5v.5a.75.75 0 0 0 1.5 0v-.5h.5a.75.75 0 0 0 0-1.5h-.5v-.5A.75.75 0 0 0 8 9Zm4.25 1.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm1.5 1.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"/>
    </svg>
  );
}
function IconBriefcase() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
      <path fillRule="evenodd" d="M6 3.75A2.75 2.75 0 0 1 8.75 1h2.5A2.75 2.75 0 0 1 14 3.75V4h1.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H6v-.25Zm2.5-1.25A1.25 1.25 0 0 0 7.25 3.75V4h5.5v-.25A1.25 1.25 0 0 0 11.5 2.5h-3Z" clipRule="evenodd"/>
    </svg>
  );
}
function IconTrophy() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
      <path fillRule="evenodd" d="M10 1c-1.418 0-2.75.228-3.994.648-.298.102-.526.314-.665.575-.14.26-.19.56-.12.852l.084.346a6.003 6.003 0 0 0 4.695 4.485v1.207a6.01 6.01 0 0 0-1.253-.131 6.01 6.01 0 0 0-2.747.664.75.75 0 0 0-.255.255 6.01 6.01 0 0 0-.664 2.747v.5c0 1.07.868 1.938 1.938 1.938h5.961A1.938 1.938 0 0 0 15.72 12.4v-.5a6.01 6.01 0 0 0-.664-2.747.75.75 0 0 0-.255-.255 6.01 6.01 0 0 0-2.747-.664c-.433 0-.851.046-1.254.131V7.56A6.003 6.003 0 0 0 15.496 3.42l.084-.346c.07-.292.02-.591-.12-.852a1.25 1.25 0 0 0-.665-.575A11.25 11.25 0 0 0 10 1ZM8.5 15.062V17.5H7.75a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5H11.5v-2.438a3.44 3.44 0 0 1-3 0Z" clipRule="evenodd"/>
    </svg>
  );
}
function IconTarget() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
      <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-2a6 6 0 1 1 0-12 6 6 0 0 1 0 12Zm0-2a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-2a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" clipRule="evenodd"/>
    </svg>
  );
}
function IconBolt() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
      <path d="M11.983 1.907a.75.75 0 0 0-1.292-.657l-8.5 9.5A.75.75 0 0 0 2.75 12h6.572l-1.305 6.093a.75.75 0 0 0 1.292.657l8.5-9.5A.75.75 0 0 0 17.25 8h-6.572l1.305-6.093Z"/>
    </svg>
  );
}
function IconPalette() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
      <path fillRule="evenodd" d="M10 18c4.418 0 8-3.134 8-7s-3.582-7-8-7-8 3.134-8 7c0 1.76.743 3.37 1.97 4.6-.097 1.016-.417 2.13-.771 2.966-.079.186.074.394.273.362 2.256-.37 3.597-.938 4.18-1.234A9.06 9.06 0 0 0 10 18Zm-1.5-9.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM8 13a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm6.5-4.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" clipRule="evenodd"/>
    </svg>
  );
}
function IconFilm() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
      <path d="M3.25 3A2.25 2.25 0 0 0 1 5.25v9.5A2.25 2.25 0 0 0 3.25 17h13.5A2.25 2.25 0 0 0 19 14.75v-9.5A2.25 2.25 0 0 0 16.75 3H3.25ZM2.5 9h2v2h-2V9Zm0 3.5h2v2a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1-.75-.75v-2Zm0-7v-.75c0-.414.336-.75.75-.75h.5c.414 0 .75.336.75.75V5.5h-2Zm13.5 0h2v-.75a.75.75 0 0 0-.75-.75h-.5a.75.75 0 0 0-.75.75V5.5Zm2 3.5h-2v2h2V9Zm0 3.5h-2v2c0 .414.336.75.75.75h.5c.414 0 .75-.336.75-.75v-2ZM6.5 6h7v8h-7V6Z"/>
    </svg>
  );
}
function IconTag() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
      <path fillRule="evenodd" d="M5.5 3A2.5 2.5 0 0 0 3 5.5v2.879a2.5 2.5 0 0 0 .732 1.767l6.5 6.5a2.5 2.5 0 0 0 3.536 0l2.878-2.878a2.5 2.5 0 0 0 0-3.536l-6.5-6.5A2.5 2.5 0 0 0 8.38 3H5.5ZM6 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd"/>
    </svg>
  );
}

const TEAM_ICONS: Record<string, React.ReactNode> = {
  "MKT Performance":       <IconChart />,
  "MKT Campaign TH":       <IconFlag />,
  "MKT Campaign SEA":      <IconGlobe />,
  "GP":                    <IconGamepad />,
  "GP(EXE)":               <IconGamepad />,
  "BD(CB)":                <IconBriefcase />,
  "BD(HOF)":               <IconTrophy />,
  "BD":                    <IconTarget />,
  "AGX":                   <IconBolt />,
  "CRI, Aztek, Topfiar":   <IconPalette />,
  "Director&Manager&Edit": <IconFilm />,
};

export default function DashboardPage() {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [config, setConfig]   = useState<DistConfig>([]);
  const [usage, setUsage]     = useState<Record<string, TeamUsage>>({});
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const buddhist = year + 543;
  const total = teamTotalCredits(year, month);

  useEffect(() => {
    setLoading(true);
    setUsage({});
    setSyncStatus("idle");

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

  const syncRemaining = () => {
    const rows: RemainingRow[] = [];
    config.forEach((priority) => {
      priority.companies.forEach((company) => {
        company.teams.forEach((team) => {
          const credit    = Math.round((team.pct / 100) * total * 100) / 100;
          const ckey      = `${company.id.toUpperCase()}::${team.summaryGroup}`;
          const perCo     = usage[ckey];
          const used      = perCo?.used  ?? usage[team.summaryGroup]?.used  ?? 0;
          const taskCount = perCo?.count ?? usage[team.summaryGroup]?.count ?? 0;
          const remaining = Math.max(0, credit - used);
          const remainingPct = credit > 0 ? Math.round((remaining / credit) * 100) : 0;
          rows.push({
            priority: priority.name,
            company: company.name,
            team: team.name,
            credit, used, remaining, remainingPct, taskCount,
          });
        });
      });
    });
    setSyncStatus("saving");
    saveRemainingToSheet(year, month, rows)
      .then((ok) => setSyncStatus(ok ? "saved" : "error"))
      .catch(() => setSyncStatus("error"));
  };

  return (
    <div style={{ background: "var(--bg-page)", minHeight: "calc(100vh - 56px)" }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

        {/* ── Header ── */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-start justify-between gap-4 mb-3 sm:mb-4">
            <p className="text-xs font-black uppercase tracking-[0.15em] pt-1"
              style={{ color: "var(--accent)" }}>Dashboard · เครดิตประจำเดือน</p>
            <div className="flex items-center gap-3">
              {syncStatus === "saving" && (
                <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>⏳ กำลังบันทึก…</span>
              )}
              {syncStatus === "saved" && (
                <span className="text-xs font-medium" style={{ color: "#22C55E" }}>✓ บันทึกลง Sheet แล้ว</span>
              )}
              {syncStatus === "error" && (
                <span className="text-xs font-medium" style={{ color: "#EF4444" }}>⚠ บันทึกไม่สำเร็จ</span>
              )}
              {!loading && syncStatus === "idle" && (
                <button
                  onClick={syncRemaining}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all hover:opacity-80"
                  style={{ borderColor: "var(--border)", color: "var(--text-muted)", background: "var(--bg-card)" }}>
                  ↑ Sync คงเหลือ
                </button>
              )}
              <MonthSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
            </div>
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
                            const ckey      = `${company.id.toUpperCase()}::${team.summaryGroup}`;
                            const perCo     = usage[ckey];
                            const used      = perCo?.used  ?? usage[team.summaryGroup]?.used  ?? 0;
                            const taskCount = perCo?.count ?? usage[team.summaryGroup]?.count ?? 0;
                            const remaining = Math.max(0, credit - used);
                            const barWidth  = credit > 0 ? Math.round((remaining / credit) * 100) : 0;
                            const isEmpty   = used > 0 && credit > 0 && remaining === 0;
                            const isLow     = credit > 0 && barWidth <= 25 && used > 0;
                            const hasUsage  = used > 0;
                            const icon      = TEAM_ICONS[team.name] ?? <IconTag />;

                            return (
                              <div key={team.id}
                                className="rounded-xl border p-3 sm:p-4 flex flex-col gap-2 transition-all hover:shadow-md"
                                style={{ background: "var(--bg-card)", borderColor: "var(--border)", opacity: isEmpty ? 0.5 : 1 }}>

                                {/* Icon + task badge */}
                                <div className="flex items-start justify-between">
                                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                                    style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
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
                                    <span className="text-[8px] font-bold" style={{ color: isEmpty ? "#EF4444" : isLow ? "#F59E0B" : priority.bgColor }}>
                                      {hasUsage ? `${barWidth}%` : "100%"}
                                    </span>
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
