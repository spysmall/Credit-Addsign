"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import MonthSelector from "@/components/MonthSelector";
import { loadDistConfig, DistConfig } from "@/lib/distribution";
import { getWorkdayInfo, hoursToCredits } from "@/lib/workdays";
import { getHolidaysForMonth } from "@/lib/holidays";
import { TEAM_MEMBERS } from "@/lib/team";
import { fetchDistFromSheet } from "@/lib/sheetDistribution";
import { fetchAllTaskUsage, TeamUsage } from "@/lib/sheetTasks";
import { saveRemainingToSheet, RemainingRow } from "@/lib/sheetRemaining";
import { fetchLeaveHours } from "@/lib/sheetLeave";
import { teamDisplay, teamGroup, webUsageByCard } from "@/lib/taskAssign";
import { fetchMemberTeams } from "@/lib/sheetUsers";
import { useAuth } from "@/components/AuthProvider";
import { IS_BETA } from "@/lib/appEnv";

const THAI_MONTHS_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const LAYOUT_KEY = "credit-dashboard-layout-v1";
const AUTO_SYNC_KEY = (y: number, m: number) => `credit-autosync-${y}-${m}`;

function teamTotalCredits(y: number, m: number, leave: Record<string, number> = {}): number {
  const info = getWorkdayInfo(y, m);
  const active = TEAM_MEMBERS.filter((mem) => !mem.excludeFromCredits);
  return active.reduce((sum, mem) => {
    const base = mem.isLead ? (mem.customHoursPerMonth ?? info.workingHours) : info.workingHours;
    const hrs = Math.max(0, base - (leave[mem.id] ?? 0));
    return sum + hoursToCredits(hrs);
  }, 0);
}

const fmtN = (n: number) => (Math.round(n * 100) / 100).toLocaleString();

export default function DashboardPage() {
  const auth = useAuth();
  const isSuperAdmin = auth.status === "allowed" && auth.isSuperAdmin;
  const myEmail = auth.status === "allowed" ? auth.user.email : "";
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [config, setConfig]   = useState<DistConfig>([]);
  const [usage, setUsage]     = useState<Record<string, TeamUsage>>({});
  const [loading, setLoading] = useState(true);
  const [usageLoaded, setUsageLoaded] = useState(false);
  const [view, setView] = useState<"all" | "attention" | "over">("all");
  const [sortLow, setSortLow] = useState(false);
  const [layout, setLayout] = useState<"card" | "table">("card");
  useEffect(() => {
    try { if (localStorage.getItem(LAYOUT_KEY) === "table") setLayout("table"); } catch { /* ignore */ }
  }, []);
  const pickLayout = (l: "card" | "table") => {
    setLayout(l);
    try { localStorage.setItem(LAYOUT_KEY, l); } catch { /* ignore */ }
  };
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [leaveData, setLeaveData] = useState<Record<string, number>>({});
  const [webUsage, setWebUsage] = useState<Record<string, { used: number; count: number }>>({});
  const autoSyncFired = useRef(false);

  // Regular users see their own team's cards by default (can switch to everything); super admins always see all.
  const [myTeams, setMyTeams] = useState<string[] | null>(null); // null = still looking it up
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    if (isSuperAdmin || !myEmail) return;
    let alive = true;
    fetchMemberTeams().then((m) => { if (alive) setMyTeams(m.get(myEmail) ?? []); }).catch(() => { if (alive) setMyTeams([]); });
    return () => { alive = false; };
  }, [isSuperAdmin, myEmail]);

  const buddhist = year + 543;
  const total = teamTotalCredits(year, month, leaveData);

  // Tasks added through the web form (/new-task) — charged per team card
  const tasksVersion = auth.status === "allowed" ? auth.tasksVersion : 0;
  useEffect(() => { setWebUsage(webUsageByCard(year, month)); }, [year, month, tasksVersion]);

  useEffect(() => {
    setLeaveData({});
    fetchLeaveHours(year, month).then(setLeaveData).catch(() => {});
  }, [year, month]);

  useEffect(() => {
    autoSyncFired.current = false;
    setLoading(true);
    setUsageLoaded(false);
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
    fetchAllTaskUsage(year, month)
      .then((data) => { setUsage(data); setUsageLoaded(true); })
      .catch(() => setUsageLoaded(true));
  }, [year, month]);

  // Auto-sync every Friday ≥ 10:00 AM for the current month
  useEffect(() => {
    if (IS_BETA || loading || !usageLoaded) return; // the test site never writes to the sheet
    if (autoSyncFired.current) return;
    if (syncStatus !== "idle") return;

    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    if (now.getDay() !== 5 || now.getHours() < 10) return; // not Friday 10:00+
    if (year !== curYear || month !== curMonth) return;     // not current month

    const todayStr = `${curYear}-${curMonth}-${now.getDate()}`;
    if (localStorage.getItem(AUTO_SYNC_KEY(year, month)) === todayStr) return;

    autoSyncFired.current = true;
    localStorage.setItem(AUTO_SYNC_KEY(year, month), todayStr);
    syncRemaining();
  }, [loading, usageLoaded]);

  // Only sum aggregate keys (no "::") — per-company keys like "CB::GP" are
  // sub-totals of the same task, not extra usage, so including them would double-count.
  const totalUsed  = Object.entries(usage)
    .filter(([key]) => !key.includes("::"))
    .reduce((s, [, v]) => s + v.used, 0)
    + Object.values(webUsage).reduce((s, v) => s + v.used, 0);
  const totalAlloc = config.flatMap(p => p.companies).flatMap(c => c.teams)
    .reduce((s, t) => s + (t.pct / 100) * total, 0);

  const myGroups = [...new Set((myTeams ?? []).map((t) => teamGroup(t)).filter((g): g is string => !!g))];
  const filterOn = !isSuperAdmin && myGroups.length > 0 && !showAll;
  const viewConfig: DistConfig = filterOn
    ? config
        .map((p) => ({ ...p, companies: p.companies
          .map((c) => ({ ...c, teams: c.teams.filter((t) => myGroups.includes(t.summaryGroup)) }))
          .filter((c) => c.teams.length > 0) }))
        .filter((p) => p.companies.length > 0)
    : config;
  // teams with no credit allocated at all are not shown (teams that used theirs up still are)
  const shownConfig: DistConfig = viewConfig
    .map((p) => ({ ...p, companies: p.companies
      .map((c) => ({ ...c, teams: c.teams.filter((t) => t.pct > 0) }))
      .filter((c) => c.teams.length > 0) }))
    .filter((p) => p.companies.length > 0);
  // hero figures for the filtered view: credit pool and usage of just the visible cards
  const viewTeams = viewConfig.flatMap((p) => p.companies.flatMap((c) => c.teams.map((t) => ({ c, t }))));
  const viewAlloc = Math.round(viewTeams.reduce((s, { t }) => s + (t.pct / 100) * total, 0) * 100) / 100;
  const viewUsed = Math.round(viewTeams.reduce((s, { c, t }) => {
    const perCo = usage[`${c.id.toUpperCase()}::${t.summaryGroup}`];
    return s + (perCo?.used ?? usage[t.summaryGroup]?.used ?? 0) + (webUsage[t.id]?.used ?? 0);
  }, 0) * 100) / 100;
  const teamLabel = myTeams && myTeams.length ? myTeams.map(teamDisplay).join(", ") : "";

  type Co = DistConfig[number]["companies"][number];
  type Tm = Co["teams"][number];
  /** every number a team card needs, in one place so cards, alerts and filters never disagree */
  const cardStat = (company: Co, team: Tm) => {
    const credit    = Math.round((team.pct / 100) * total * 100) / 100;
    const perCo     = usage[`${company.id.toUpperCase()}::${team.summaryGroup}`];
    const web       = webUsage[team.id];
    const used      = Math.round(((perCo?.used ?? usage[team.summaryGroup]?.used ?? 0) + (web?.used ?? 0)) * 100) / 100;
    const taskCount = (perCo?.count ?? usage[team.summaryGroup]?.count ?? 0) + (web?.count ?? 0);
    const remaining = Math.max(0, credit - used);
    const hasUsage  = used > 0;
    const pctLeft   = credit > 0 ? (hasUsage ? Math.round((remaining / credit) * 100) : 100) : 0;
    const usedFrac  = credit > 0 ? Math.min(1, used / credit) : 0;
    const status: "none" | "over" | "low" | "ok" =
      credit <= 0 ? "none" : hasUsage && remaining === 0 ? "over" : hasUsage && pctLeft <= 25 ? "low" : "ok";
    return { credit, used, taskCount, remaining, hasUsage, pctLeft, usedFrac, status };
  };
  // how far into the month's working days we are (0..1); past months are fully elapsed
  const paceFrac = (() => {
    const t = new Date();
    const cur = year * 12 + month, nowV = t.getFullYear() * 12 + t.getMonth() + 1;
    if (cur < nowV) return 1;
    if (cur > nowV) return 0;
    const hol = new Set(getHolidaysForMonth(year, month).map((h) => h.date));
    let done = 0;
    for (let d = 1; d <= t.getDate(); d++) {
      const dow = new Date(year, month - 1, d).getDay();
      const key = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (dow !== 0 && dow !== 6 && !hol.has(key)) done++;
    }
    const info = getWorkdayInfo(year, month);
    return info.workingDays > 0 ? Math.min(1, done / info.workingDays) : 0;
  })();
  const isCurrentMonth = paceFrac > 0 && paceFrac < 1;

  const allCards = shownConfig.flatMap((p) => p.companies.flatMap((c) => c.teams.map((t) => ({ c, t, st: cardStat(c, t) }))));
  const overCount = allCards.filter((x) => x.st.status === "over").length;
  const attention = allCards.filter((x) => x.st.status === "over" || x.st.status === "low")
    .sort((a, b) => a.st.pctLeft - b.st.pctLeft);
  const visibleConfig: DistConfig = shownConfig
    .map((p) => ({ ...p, companies: p.companies
      .map((c) => {
        let teams = c.teams.filter((t) => {
          const k = cardStat(c, t).status;
          return view === "all" || (view === "over" ? k === "over" : k === "over" || k === "low");
        });
        if (sortLow) teams = [...teams].sort((a, b) => cardStat(c, a).pctLeft - cardStat(c, b).pctLeft);
        return { ...c, teams };
      })
      .filter((c) => c.teams.length > 0) }))
    .filter((p) => p.companies.length > 0);
  const syncRemaining = () => {
    const rows: RemainingRow[] = [];
    config.forEach((priority) => {
      priority.companies.forEach((company) => {
        company.teams.forEach((team) => {
          const credit    = Math.round((team.pct / 100) * total * 100) / 100;
          const ckey      = `${company.id.toUpperCase()}::${team.summaryGroup}`;
          const perCo     = usage[ckey];
          const web       = webUsage[team.id];
          const used      = Math.round(((perCo?.used  ?? usage[team.summaryGroup]?.used  ?? 0) + (web?.used ?? 0)) * 100) / 100;
          const taskCount = (perCo?.count ?? usage[team.summaryGroup]?.count ?? 0) + (web?.count ?? 0);
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">

        {/* ── Header: one row ── */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-secondary)" }}>เครดิตประจำเดือน</p>
            <h1 className="text-3xl sm:text-4xl font-bold leading-tight tracking-tight" style={{ color: "var(--text-primary)" }}>
              {THAI_MONTHS_SHORT[month - 1]}{" "}
              <span className="num" style={{ color: "var(--accent-strong)" }}>{buddhist}</span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {!isSuperAdmin && myGroups.length > 0 && (
              <div className="inline-flex rounded-lg border p-0.5 text-xs font-semibold" role="group" aria-label="ขอบเขตข้อมูล"
                style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
                {[{ all: false, label: `ทีมของฉัน${teamLabel ? ` (${teamLabel})` : ""}` }, { all: true, label: "ทั้งหมด" }].map((o) => (
                  <button key={String(o.all)} type="button" aria-pressed={showAll === o.all} onClick={() => setShowAll(o.all)}
                    className="px-3 py-1.5 rounded-md transition-colors"
                    style={showAll === o.all ? { background: "var(--bg-dark)", color: "#fff" } : { color: "var(--text-secondary)" }}>
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            <MonthSelector className="flex-1 sm:flex-none" year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
            <Link href="/new-task"
              className="btn-primary inline-flex items-center gap-1.5 rounded-xl h-11 px-5 text-sm font-semibold shrink-0">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M10 4v12M4 10h12" /></svg>
              <span className="sm:hidden">ส่งรีเควส</span><span className="hidden sm:inline">ส่งรีเควสงาน</span>
            </Link>
          </div>
        </div>

        {/* ── Credit summary: one compact band ── */}
        {(() => {
          const pool = filterOn ? viewAlloc : total;
          const used = filterOn ? viewUsed : totalUsed;
          const left = Math.max(0, Math.round((pool - used) * 100) / 100);
          const usedPct = pool > 0 ? Math.min(100, Math.round((used / pool) * 100)) : 0;
          const n = new Date();
          const syncedToday = year === n.getFullYear() && month === n.getMonth() + 1
            && localStorage.getItem(AUTO_SYNC_KEY(year, month)) === `${n.getFullYear()}-${n.getMonth() + 1}-${n.getDate()}`;
          const dim = { color: "rgba(255,255,255,0.7)" };
          return (
            <div className="surface-dark p-5 sm:p-6 mb-7">
              <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={dim}>{filterOn ? `ทีม ${teamLabel}` : `รวมทั้งทีม ${TEAM_MEMBERS.filter((m) => !m.excludeFromCredits).length} คน`}</p>
                  <p className="flex items-baseline gap-2 mt-1">
                    <span className="num text-5xl sm:text-6xl font-bold leading-none tracking-tight">{pool.toLocaleString()}</span>
                    <span className="text-sm font-medium" style={dim}>M Coin</span>
                  </p>
                </div>
                <dl className="flex gap-3">
                  <div className="rounded-2xl px-4 py-2.5 min-w-[6.5rem]" style={{ background: "rgba(255,255,255,0.08)" }}>
                    <dt className="text-xs" style={dim}>ใช้ไป</dt>
                    <dd className="num text-xl font-semibold leading-tight">{used.toLocaleString()}</dd>
                  </div>
                  <div className="rounded-2xl px-4 py-2.5 min-w-[6.5rem]" style={{ background: "rgba(232,81,30,0.22)" }}>
                    <dt className="text-xs" style={dim}>คงเหลือ</dt>
                    <dd className="num text-xl font-semibold leading-tight" style={{ color: "#FFB599" }}>{left.toLocaleString()}</dd>
                  </div>
                </dl>
              </div>
              <div className="h-2 rounded-full overflow-hidden mt-5" style={{ background: "rgba(255,255,255,0.12)" }}
                role="img" aria-label={`ใช้ไปแล้ว ${usedPct}%`}>
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${usedPct}%`, background: "linear-gradient(90deg,#FF8A63,#E8511E)" }} />
              </div>
              <p className="num text-xs mt-2 text-right" style={dim}>ใช้ไปแล้ว {usedPct}%</p>
              {isSuperAdmin && !IS_BETA && (
                <div className="flex items-center gap-3 mt-2.5 text-xs">
                  <button type="button" onClick={syncRemaining} disabled={loading || syncStatus === "saving"}
                    className="font-semibold px-2.5 py-1 rounded-md border transition-colors hover:bg-white/10 disabled:opacity-50"
                    style={{ borderColor: "rgba(255,255,255,0.25)", color: "#fff" }}>
                    Sync คงเหลือ
                  </button>
                  <span role={syncStatus === "error" ? "alert" : "status"}
                    style={{ color: syncStatus === "error" ? "#FCA5A5" : syncStatus === "saved" || syncedToday ? "#86EFAC" : "rgba(255,255,255,0.7)" }}>
                    {syncStatus === "saving" ? "กำลังบันทึก…"
                      : syncStatus === "saved" ? "✓ บันทึกลง Sheet แล้ว"
                      : syncStatus === "error" ? "บันทึกไม่สำเร็จ · ลองใหม่"
                      : syncedToday ? "Auto sync แล้ววันนี้" : "Auto sync ทุกวันศุกร์ 10:00"}
                  </span>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Filter / sort ── */}
        {!loading && (
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            {isSuperAdmin ? (
            <div className="inline-flex rounded-full border p-1 text-xs font-semibold" role="group" aria-label="กรองการ์ด"
              style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              {([["all", "ทั้งหมด", allCards.length], ["attention", "ใกล้หมด", attention.length], ["over", "ใช้เกิน", overCount]] as const).map(([k, label, n]) => (
                <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}
                  className="px-3.5 py-1.5 rounded-full transition-all"
                  style={view === k ? { background: "var(--bg-dark)", color: "#fff" } : { color: "var(--text-secondary)" }}>
                  {label} <span className="num opacity-70">{n}</span>
                </button>
              ))}
            </div>
            ) : <span />}
            <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full border p-1 text-xs font-semibold" role="group" aria-label="รูปแบบการแสดงผล"
              style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
              {([["card", "การ์ด"], ["table", "ตาราง"]] as const).map(([k, label]) => (
                <button key={k} type="button" aria-pressed={layout === k} onClick={() => pickLayout(k)}
                  className="px-3.5 py-1.5 rounded-full transition-all"
                  style={layout === k ? { background: "var(--bg-dark)", color: "#fff" } : { color: "var(--text-secondary)" }}>
                  {label}
                </button>
              ))}
            </div>
            <button type="button" aria-pressed={sortLow} onClick={() => setSortLow((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition-all"
              style={sortLow ? { background: "var(--bg-dark)", color: "#fff", borderColor: "var(--bg-dark)" } : { background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>
              <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 4v12M3 13l3 3 3-3M14 16V4M11 7l3-3 3 3" /></svg>
              เหลือน้อยก่อน
            </button>
            </div>
          </div>
        )}

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
          <div className="flex flex-col gap-6 mb-4">
            {visibleConfig.length === 0 && (
              <p className="surface px-5 py-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>ไม่มีทีมที่ตรงกับตัวกรองนี้ 🎉</p>
            )}
            {visibleConfig.map((priority) => (
              <section key={priority.id} aria-label={priority.name}>
                <div className="flex items-center gap-3 mb-4 pb-2.5 border-b" style={{ borderColor: "var(--border)" }}>
                  <span className="w-1 h-6 rounded-full" style={{ background: priority.bgColor }} aria-hidden />
                  <h2 className="text-xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>{priority.name}</h2>
                </div>

                <div className="flex flex-col gap-4">
                  {priority.companies.map((company) => {
                    const companyCredit = Math.round(
                      company.teams.reduce((s, t) => s + (t.pct / 100) * total, 0) * 100
                    ) / 100;
                    const companyPct = company.teams.reduce((s, t) => s + t.pct, 0);

                    return (
                      <div key={company.id}>
                        <div className="flex items-baseline gap-3 mb-2.5">
                          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{company.name}</h3>
                          <span className="num text-xs rounded-full px-2 py-0.5" style={{ background: "var(--border)", color: "var(--text-secondary)" }}>
                            {companyPct}% · {companyCredit.toLocaleString()} M Coin
                          </span>
                        </div>

                        {layout === "table" ? (
                          <div className="surface px-4 sm:px-5 py-1">
                            <div className="hidden sm:grid grid-cols-[1.4fr_0.8fr_1.6fr_1fr] gap-x-4 py-2.5 text-xs" style={{ color: "var(--text-secondary)" }} aria-hidden>
                              <span>ทีม</span><span className="text-right">คงเหลือ (M Coin)</span><span>การใช้งาน</span><span className="text-right">ใช้ / โควตา</span>
                            </div>
                            <ul>
                              {company.teams.map((team) => {
                                const { credit, used, taskCount, remaining, hasUsage, usedFrac, status } = cardStat(company, team);
                                const tone = status === "over" ? "var(--danger)" : status === "low" ? "var(--warning)" : status === "none" ? "var(--text-muted)" : "var(--text-primary)";
                                const barTone = status === "over" ? "var(--danger)" : status === "low" ? "var(--warning)" : "var(--accent)";
                                return (
                                  <li key={team.id} id={`card-${company.id}-${team.id}`}
                                    className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[1.4fr_0.8fr_1.6fr_1fr] items-center gap-x-4 gap-y-1.5 py-3 text-sm"
                                    style={{ borderTop: "1px solid var(--border)" }}>
                                    <span className="font-semibold truncate" style={{ color: "var(--text-primary)" }} title={team.name}>{team.name}</span>
                                    <span className="num text-right text-lg font-bold leading-none" style={{ color: tone }}>
                                      {credit > 0 ? (hasUsage ? remaining : credit).toLocaleString() : "—"}
                                    </span>
                                    <div className="col-span-2 sm:col-span-1 relative h-2 rounded-full" style={{ background: "var(--border)" }}
                                      role="img" aria-label={credit > 0 ? `ใช้ไปแล้ว ${Math.round(usedFrac * 100)}%` : "ยังไม่ได้จัดสรร"}>
                                      {credit > 0 && <div className="h-full rounded-full" style={{ width: `${Math.round(usedFrac * 100)}%`, background: barTone }} />}
                                      {isSuperAdmin && isCurrentMonth && credit > 0 && (
                                        <span className="absolute -top-1 -bottom-1 w-0.5 rounded-full" style={{ left: `${Math.round(paceFrac * 100)}%`, background: "var(--text-primary)", opacity: 0.55 }}
                                          title={`ตามแผนควรใช้ไปราว ${Math.round(paceFrac * 100)}% แล้ว`} aria-hidden />
                                      )}
                                    </div>
                                    <span className="col-span-2 sm:col-span-1 num flex sm:justify-end justify-between gap-3 text-xs" style={{ color: "var(--text-secondary)" }}>
                                      <span style={status === "over" ? { color: "var(--danger)", fontWeight: 600 } : undefined}>
                                        {credit <= 0 ? "ยังไม่ได้จัดสรร" : hasUsage ? `${fmtN(used)} / ${fmtN(credit)}` : `0 / ${fmtN(credit)}`}
                                      </span>
                                      <span className="sm:hidden">{taskCount > 0 ? `${taskCount} ชิ้น` : ""}</span>
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                          {company.teams.map((team) => {
                            const { credit, used, taskCount, remaining, hasUsage, usedFrac, status } = cardStat(company, team);
                            const isEmpty = status === "over";
                            const isLow   = status === "low";
                            // colour is reserved for exceptions: cards are neutral unless a team is low (amber) or over (red)
                            const tone =
                              status === "none" ? "var(--text-muted)"
                              : isEmpty ? "var(--danger)"
                              : isLow ? "var(--warning)"
                              : "var(--text-primary)";
                            const ringTone = status === "ok" ? "var(--accent)" : tone;
                            const ahead = isSuperAdmin && isCurrentMonth && status === "ok" && usedFrac > paceFrac + 0.1;

                            return (
                              <div key={team.id} id={`card-${company.id}-${team.id}`} tabIndex={-1}
                                className="surface lift p-4 flex flex-col gap-3.5 h-full scroll-mt-24 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                                style={isEmpty ? { borderColor: "var(--danger-line)" }
                                  : status === "ok" ? { background: "linear-gradient(180deg, var(--accent-light) 0%, var(--bg-card) 58%)" } : undefined}>
                                {/* 1 · who */}
                                <div className="flex items-center justify-between gap-2 min-w-0">
                                  <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }} title={team.name}>
                                    {team.name}
                                  </p>
                                  {credit > 0 && (
                                    <svg viewBox="0 0 36 36" width="32" height="32" className="shrink-0 -rotate-90" role="img"
                                      aria-label={`คงเหลือ ${100 - Math.round(usedFrac * 100)}%${isSuperAdmin && isCurrentMonth ? ` · ตามแผนควรเหลือราว ${100 - Math.round(paceFrac * 100)}%` : ""}`}>
                                      <circle cx="18" cy="18" r="14" fill="none" strokeWidth="5" stroke="var(--border)" />
                                      <circle cx="18" cy="18" r="14" fill="none" strokeWidth="5" strokeLinecap="round" stroke={ringTone}
                                        pathLength={100} strokeDasharray={`${100 - Math.round(usedFrac * 100)} 100`} />
                                      {isSuperAdmin && isCurrentMonth && (
                                        <line x1="29.5" y1="18" x2="35" y2="18" strokeWidth="2" strokeLinecap="round" stroke="var(--text-primary)" opacity="0.6"
                                          transform={`rotate(${Math.round((1 - paceFrac) * 360)} 18 18)`}>
                                          <title>{`ตามแผนควรเหลือราว ${100 - Math.round(paceFrac * 100)}% แล้ว`}</title>
                                        </line>
                                      )}
                                    </svg>
                                  )}
                                </div>

                                {/* 2 · the number that matters: what is left */}
                                <div>
                                  <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>{credit > 0 ? "คงเหลือ" : "เครดิต"}</p>
                                  <p className="flex items-baseline gap-1.5">
                                    <span className="num text-3xl font-bold leading-none" style={{ color: tone }}>
                                      {credit > 0 ? (hasUsage ? remaining : credit).toLocaleString() : "—"}
                                    </span>
                                    {credit > 0 && <span className="text-xs" style={{ color: "var(--text-secondary)" }}>M Coin</span>}
                                  </p>
                                  {ahead && (
                                    <p className="inline-block mt-1.5 text-xs font-semibold rounded-md px-1.5 py-0.5" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>ใช้เร็วกว่าแผน</p>
                                  )}
                                  {(isEmpty || isLow) && (
                                    <p className="inline-block mt-1.5 text-xs font-semibold rounded-md px-1.5 py-0.5"
                                      style={isEmpty
                                        ? { background: "var(--danger-bg)", color: "var(--danger)" }
                                        : { background: "var(--warning-bg)", color: "var(--warning)" }}>
                                      {isEmpty ? `เกินโควตา ${fmtN(used - credit)}` : "เหลือน้อย"}
                                    </p>
                                  )}
                                </div>

                                {/* 3 · how it got there */}
                                <div className="mt-auto pt-3 border-t flex items-center justify-between gap-2 num text-xs" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                                  <span className="whitespace-nowrap rounded-md px-2 py-0.5 font-medium" style={status === "over" ? { background: "var(--danger-bg)", color: "var(--danger)" } : status === "low" ? { background: "var(--warning-bg)", color: "var(--warning)" } : { background: "var(--accent-light)", color: "var(--accent-strong)" }}>
                                    {credit <= 0 ? "ยังไม่ได้จัดสรร" : hasUsage ? `ใช้ ${fmtN(used)} / ${fmtN(credit)}` : `ยังไม่มีการใช้ · ${fmtN(credit)}`}
                                  </span>
                                  <span className="shrink-0 whitespace-nowrap">{taskCount > 0 ? `${taskCount} ชิ้น` : "—"}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        <p className="text-xs mt-2 text-center" style={{ color: "var(--text-muted)" }}>
          เครดิตคำนวณจาก % ที่จัดสรรใน Credit Distribution · ใช้ไปจาก [sum] All Task(in Notion)
        </p>
      </div>
    </div>
  );
}
