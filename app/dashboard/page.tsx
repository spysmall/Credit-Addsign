"use client";

import { useState, useEffect } from "react";
import MonthSelector from "@/components/MonthSelector";
import { loadDistConfig, computeSummaryCredits, getSummaryGroups } from "@/lib/distribution";
import { getWorkdayInfo, hoursToCredits } from "@/lib/workdays";
import { TEAM_MEMBERS } from "@/lib/team";
import { fetchDistFromSheet } from "@/lib/sheetDistribution";
import { fetchNoteFromSheet } from "@/lib/sheetDistribution";

const THAI_MONTHS_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

function teamTotalCredits(y: number, m: number): number {
  const info = getWorkdayInfo(y, m);
  const active = TEAM_MEMBERS.filter((mem) => !mem.excludeFromCredits);
  return active.reduce((sum, mem) => {
    const hrs = mem.isLead ? (mem.customHoursPerMonth ?? info.workingHours) : info.workingHours;
    return sum + hoursToCredits(hrs);
  }, 0);
}

// Team icon mapping
const TEAM_ICONS: Record<string, string> = {
  "MKT Performance":      "📊",
  "MKT Campaign TH":      "🇹🇭",
  "MKT Campaign SEA":     "🌏",
  "GP":                   "🎮",
  "BD(CB)":               "💼",
  "BD(HOF)":              "🏆",
  "AGX":                  "⚡",
  "WR":                   "🎯",
  "CRI, Aztek, Topfiar":  "🎨",
  "Director&Manager&Edit":"🎬",
};

export default function DashboardPage() {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [alloc, setAlloc]   = useState<Record<string, number>>({});
  const [groups, setGroups] = useState<string[]>([]);
  const [notes, setNotes]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const buddhist = year + 543;
  const total = teamTotalCredits(year, month);

  useEffect(() => {
    setLoading(true);
    setNotes(null);

    // Fetch distribution from sheet first, fallback to localStorage
    fetchDistFromSheet(year, month).then((sheetMap) => {
      const config = loadDistConfig(year, month);
      if (sheetMap) {
        // Apply sheet values
        const merged = config.map((p) => ({
          ...p,
          companies: p.companies.map((c) => ({
            ...c,
            teams: c.teams.map((t) =>
              sheetMap[t.id] !== undefined ? { ...t, pct: sheetMap[t.id] } : t
            ),
          })),
        }));
        setAlloc(computeSummaryCredits(merged, total));
        setGroups(getSummaryGroups(merged));
      } else {
        setAlloc(computeSummaryCredits(config, total));
        setGroups(getSummaryGroups(config));
      }
      setLoading(false);
    });

    fetchNoteFromSheet(year, month).then((note) => {
      if (note) setNotes(note);
    });
  }, [year, month, total]);

  const maxCredit = Math.max(...Object.values(alloc), 1);

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
            </p>
          </div>
          <div className="relative shrink-0 hidden sm:block">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
              style={{ background: "var(--accent)" }}>
              💰
            </div>
          </div>
        </div>

        {/* ── Team cards grid ── */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl border p-4 sm:p-5 animate-pulse"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)", minHeight: 120 }}>
                <div className="w-8 h-8 rounded-xl mb-3" style={{ background: "var(--border)" }} />
                <div className="w-3/4 h-3 rounded mb-2" style={{ background: "var(--border)" }} />
                <div className="w-1/2 h-8 rounded" style={{ background: "var(--border)" }} />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            {groups.map((group) => {
              const credit = alloc[group] ?? 0;
              const pct = credit > 0 ? Math.round((credit / total) * 100) : 0;
              const barWidth = credit > 0 ? Math.round((credit / maxCredit) * 100) : 0;
              const icon = TEAM_ICONS[group] ?? "🏷️";

              return (
                <div key={group}
                  className="rounded-2xl border p-4 sm:p-5 flex flex-col gap-3 transition-all hover:shadow-md"
                  style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>

                  {/* Icon + % badge */}
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                      style={{ background: "var(--accent-light)" }}>
                      {icon}
                    </div>
                    <span className="text-[10px] font-black rounded-full px-2 py-0.5"
                      style={{ background: "var(--bg-page)", color: "var(--text-muted)" }}>
                      {pct}%
                    </span>
                  </div>

                  {/* Team name */}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest leading-tight"
                      style={{ color: "var(--text-muted)" }}>
                      {group}
                    </p>
                  </div>

                  {/* Credit amount */}
                  <div className="mt-auto">
                    <div className="flex items-end gap-1 mb-2">
                      <span className="text-2xl sm:text-3xl font-black leading-none"
                        style={{ color: credit > 0 ? "var(--accent)" : "var(--text-muted)" }}>
                        {credit > 0 ? credit.toLocaleString() : "—"}
                      </span>
                      {credit > 0 && (
                        <span className="text-xs font-semibold mb-0.5" style={{ color: "var(--text-muted)" }}>
                          M Coin
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${barWidth}%`, background: "var(--accent)", opacity: credit > 0 ? 1 : 0 }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Notes ── */}
        {notes && (
          <div className="rounded-2xl border overflow-hidden"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
            <div className="px-4 py-2.5 border-b flex items-center gap-2"
              style={{ borderColor: "var(--border)", background: "var(--bg-page)" }}>
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                📝 หมายเหตุประจำเดือน
              </span>
            </div>
            <div className="px-4 py-3">
              <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text-primary)" }}>
                {notes}
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-[10px] mt-6 text-center" style={{ color: "var(--text-muted)" }}>
          เครดิตคำนวณจาก % ที่จัดสรรใน Credit Distribution · อัปเดตอัตโนมัติ
        </p>
      </div>
    </div>
  );
}
