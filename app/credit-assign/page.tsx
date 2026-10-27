"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import MonthSelector from "@/components/MonthSelector";
import { getWorkdayInfo, hoursToCredits } from "@/lib/workdays";
import { TEAM_MEMBERS } from "@/lib/team";
import { fetchLeaveHours } from "@/lib/sheetLeave";
import {
  DistConfig, DistTeam,
  DEFAULT_DIST_CONFIG,
  loadDistConfig, saveDistConfig,
  totalPct, computeSummaryCredits, getSummaryGroups,
} from "@/lib/distribution";
import { fetchAllTaskUsage, TeamUsage } from "@/lib/sheetTasks";
import { fetchDistFromSheet, saveDistToSheet, flattenConfig, fetchNoteFromSheet, saveNoteToSheet } from "@/lib/sheetDistribution";
import AdminGate from "@/components/AdminGate";
import { IS_BETA } from "@/lib/appEnv";

const THAI_MONTHS_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const SHARE_COLORS = ["#E8511E", "#C8410F", "#F0997B", "#8A2E0C", "#F5C4B3", "#5F5E5A", "#B4B2A9"];
const notesKey = (y: number, m: number) => `credit-notes-v1-${y}-${m}`;

function prevYM(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function teamTotalCreditsForMonth(y: number, m: number, leave: Record<string, number> = {}): number {
  const info = getWorkdayInfo(y, m);
  const active = TEAM_MEMBERS.filter((mem) => !mem.excludeFromCredits);
  return active.reduce((sum, mem) => {
    const base = mem.isLead ? (mem.customHoursPerMonth ?? info.workingHours) : info.workingHours;
    const hrs = Math.max(0, base - (leave[mem.id] ?? 0));
    return sum + hoursToCredits(hrs);
  }, 0);
}

export default function CreditDistributionPage() {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [config, setConfig] = useState<DistConfig>(DEFAULT_DIST_CONFIG);

  // editing state: which team id is being edited
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal, setEditVal]     = useState("");

  // sheet sync state
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // notes
  const [notes, setNotes] = useState("");
  const [noteSyncStatus, setNoteSyncStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // leave hours for current and previous month
  const [leaveData, setLeaveData]         = useState<Record<string, number>>({});
  const [prevLeaveData, setPrevLeaveData] = useState<Record<string, number>>({});

  // teams at 0% are hidden unless asked for, to keep the table short
  const [showZero, setShowZero] = useState(false);

  // previous month sheet data
  const [prevUsage, setPrevUsage]     = useState<Record<string, TeamUsage>>({});
  const [prevLoading, setPrevLoading] = useState(false);

  // Load notes: localStorage first, sheet wins when available
  const loadNotes = useCallback((y: number, m: number) => {
    const local = localStorage.getItem(notesKey(y, m)) ?? "";
    setNotes(local);
    setNoteSyncStatus("idle");
    fetchNoteFromSheet(y, m).then((sheetNote) => {
      if (sheetNote !== null) {
        setNotes(sheetNote);
        localStorage.setItem(notesKey(y, m), sheetNote);
      }
    });
  }, []);

  useEffect(() => {
    loadNotes(year, month);
  }, [year, month, loadNotes]);

  // Re-fetch notes when tab becomes visible (to get latest from sheet)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") loadNotes(year, month);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [year, month, loadNotes]);

  // Load config: localStorage first, then merge from sheet
  useEffect(() => {
    const local = loadDistConfig(year, month);
    setConfig(local);
    setEditingId(null);
    setSyncStatus("idle");

    fetchDistFromSheet(year, month).then((sheetMap) => {
      if (!sheetMap) return;
      setConfig((prev) => {
        const merged: DistConfig = prev.map((p) => ({
          ...p,
          companies: p.companies.map((c) => ({
            ...c,
            teams: c.teams.map((t) =>
              sheetMap[t.id] !== undefined ? { ...t, pct: sheetMap[t.id] } : t
            ),
          })),
        }));
        saveDistConfig(year, month, merged);
        return merged;
      });
    });
  }, [year, month]);

  // Fetch leave hours for current and previous month
  useEffect(() => {
    const { year: py, month: pm } = prevYM(year, month);
    setLeaveData({});
    fetchLeaveHours(year, month).then(setLeaveData).catch(() => {});
    setPrevLeaveData({});
    fetchLeaveHours(py, pm).then(setPrevLeaveData).catch(() => {});
  }, [year, month]);

  // Fetch previous month's task usage
  useEffect(() => {
    const { year: py, month: pm } = prevYM(year, month);
    setPrevLoading(true);
    setPrevUsage({});
    fetchAllTaskUsage(py, pm)
      .then(setPrevUsage)
      .catch(() => {})
      .finally(() => setPrevLoading(false));
  }, [year, month]);

  const totalCredits = teamTotalCreditsForMonth(year, month, leaveData);
  const sum = totalPct(config);
  const summaryGroups = getSummaryGroups(config);

  // Credits per summary group for current month
  const currentAlloc = computeSummaryCredits(config, totalCredits);

  // Previous month credits
  const { year: py, month: pm } = prevYM(year, month);
  const prevTotalCredits = teamTotalCreditsForMonth(py, pm, prevLeaveData);
  const prevConfig       = loadDistConfig(py, pm); // synchronous from localStorage or default
  const prevAlloc        = computeSummaryCredits(prevConfig, prevTotalCredits);

  // Update a team's pct — debounce sheet save by 1.5s
  const updatePct = useCallback((teamId: string, newPct: number) => {
    setConfig((prev) => {
      const next: DistConfig = prev.map((p) => ({
        ...p,
        companies: p.companies.map((c) => ({
          ...c,
          teams: c.teams.map((t) => t.id === teamId ? { ...t, pct: newPct } : t),
        })),
      }));
      saveDistConfig(year, month, next);

      // Debounced sheet save
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSyncStatus("saving");
      saveTimer.current = setTimeout(() => {
        saveDistToSheet(year, month, flattenConfig(next))
          .then((ok) => setSyncStatus(ok ? "saved" : "error"))
          .catch(() => setSyncStatus("error"));
      }, 1500);

      return next;
    });
  }, [year, month]);

  const startEdit = (t: DistTeam) => {
    if (IS_BETA) return;
    setEditingId(t.id);
    setEditVal(String(t.pct));
  };

  const commitEdit = (teamId: string) => {
    const v = parseFloat(editVal);
    if (!isNaN(v) && v >= 0) updatePct(teamId, Math.round(v * 10) / 10);
    setEditingId(null);
  };

  const buddhist = year + 543;

  // Past month = cannot edit
  const now = new Date();
  // the beta test site is read-only, same as a past month
  const isPastMonth = IS_BETA || year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1);

  const prevUsedTotal = summaryGroups.reduce((s, g) => Math.round((s + (prevUsage[g]?.used ?? 0)) * 100) / 100, 0);
  const fmt2 = (n: number) => (Math.round(n * 100) / 100).toLocaleString();
  const DIST = "minmax(0,1fr) 88px 104px";
const CMP = "minmax(0,1fr) 76px 76px 84px";

  const syncNow = () => {
    setSyncStatus("saving");
    saveDistToSheet(year, month, flattenConfig(config))
      .then((ok) => setSyncStatus(ok ? "saved" : "error"))
      .catch(() => setSyncStatus("error"));
  };
  const saveNotes = () => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
    setNoteSyncStatus("saving");
    localStorage.setItem(notesKey(year, month), notes);
    saveNoteToSheet(year, month, notes)
      .then((ok) => setNoteSyncStatus(ok ? "saved" : "error"))
      .catch(() => setNoteSyncStatus("error"));
  };

  // flat company list in priority order, each with a colour from the brand ramp for the share bar
  const companies = config.flatMap((p) => p.companies.map((c) => ({ priority: p, company: c })))
    .map((x, i) => ({ ...x, pct: x.company.teams.reduce((s, t) => s + t.pct, 0), color: SHARE_COLORS[i % SHARE_COLORS.length] }));
  const zeroCount = companies.reduce((n, x) => n + x.company.teams.filter((t) => t.pct <= 0).length, 0);
  const noteStatus = noteSyncStatus === "saving" ? "กำลังบันทึก…" : noteSyncStatus === "saved" ? "✓ บันทึกแล้ว" : noteSyncStatus === "error" ? "บันทึกไม่สำเร็จ" : "";

  return (
    <AdminGate>
    <div className="lg:h-[calc(100vh-57px)] flex flex-col" style={{ background: "var(--bg-page)" }}>
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col gap-4 lg:flex-1 lg:min-h-0">

        {/* ── Header ── */}
        <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-secondary)" }}>Credit Distribution</p>
            <h1 className="text-3xl font-bold tracking-tight leading-tight" style={{ color: "var(--text-primary)" }}>
              {THAI_MONTHS_SHORT[month - 1]} <span className="num" style={{ color: "var(--accent-strong)" }}>{buddhist}</span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs" role="status" style={{ color: syncStatus === "error" ? "var(--danger)" : syncStatus === "saved" ? "var(--success)" : "var(--text-secondary)" }}>
              {syncStatus === "saving" ? "กำลังบันทึก…" : syncStatus === "saved" ? "✓ บันทึกลง Sheet แล้ว" : syncStatus === "error" ? "บันทึกไม่สำเร็จ" : ""}
            </span>
            {!isPastMonth && syncStatus !== "saving" && (
              <button type="button" onClick={syncNow}
                className="h-10 rounded-lg border px-3 text-xs font-semibold transition-colors hover:bg-black/5"
                style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text-secondary)" }}>
                ↑ Sync to Sheet
              </button>
            )}
            <MonthSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_460px] gap-4 lg:flex-1 lg:min-h-0">

          {/* ── Left: allocation ── */}
          <section className="surface flex flex-col overflow-hidden lg:min-h-0" aria-label="สัดส่วนเครดิต">
            {/* total + share bar */}
            <div className="px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>เครดิตรวมทั้งทีม (หักวันลาแล้ว)</p>
                  <p className="flex items-baseline gap-2 mt-0.5">
                    <span className="num text-4xl font-bold leading-none tracking-tight" style={{ color: "var(--text-primary)" }}>{fmt2(totalCredits)}</span>
                    <span className="text-sm" style={{ color: "var(--text-secondary)" }}>M Coin</span>
                  </p>
                </div>
                <span className="num shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
                  style={sum === 100
                    ? { background: "var(--success-bg)", color: "var(--success)" }
                    : { background: "var(--warning-bg)", color: "var(--warning)" }}>
                  {sum === 100 ? "แบ่งครบ 100%" : `แบ่งแล้ว ${sum.toFixed(1)}% · ${sum < 100 ? `เหลือ ${(100 - sum).toFixed(1)}%` : `เกิน ${(sum - 100).toFixed(1)}%`}`}
                </span>
              </div>
              <div className="mt-2.5 flex h-2.5 gap-0.5 overflow-hidden rounded-full" style={{ background: "var(--border)" }}
                role="img" aria-label={companies.filter((x) => x.pct > 0).map((x) => `${x.company.name} ${x.pct}%`).join(", ")}>
                {companies.filter((x) => x.pct > 0).map((x) => (
                  <span key={x.company.id} style={{ flex: x.pct, background: x.color }} title={`${x.company.name} ${x.pct}%`} />
                ))}
                {sum < 100 && <span style={{ flex: 100 - sum }} />}
              </div>
            </div>

            {/* companies and their teams as one table */}
            <div className="lg:flex-1 lg:min-h-0 lg:overflow-auto">
                  <div className="sticky top-0 z-10 grid items-center px-5 h-8 text-xs border-b" style={{ gridTemplateColumns: DIST, borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--bg-card)" }}>
                    <span className="flex items-center gap-3">บริษัท / ทีม
                      {zeroCount > 0 && (
                        <button type="button" onClick={() => setShowZero((v) => !v)} aria-pressed={showZero}
                          className="rounded-md px-1.5 py-0.5 font-semibold underline underline-offset-2 hover:bg-black/5" style={{ color: "var(--text-secondary)" }}>
                          {showZero ? "ซ่อนทีมที่ไม่มีเครดิต" : `แสดงทีมที่เป็น 0% (${zeroCount})`}
                        </button>
                      )}
                    </span><span className="text-right">%</span><span className="text-right">M Coin</span>
                  </div>
                  {companies.filter((x) => showZero || x.pct > 0).map(({ priority, company, pct, color }) => {
                    const coins = (pct / 100) * totalCredits;
                    return (
                      <div key={company.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                        <div className="grid items-center px-5 h-[30px]" style={{ gridTemplateColumns: DIST, background: "var(--bg-page)" }}>
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: pct > 0 ? color : "var(--border)" }} aria-hidden />
                            <span className="truncate text-sm font-bold" style={{ color: "var(--text-primary)" }} title={company.name}>{company.name}</span>
                            <span className="shrink-0 text-xs font-normal" style={{ color: "var(--text-muted)" }}>{priority.name.replace("Priority : ", "")}</span>
                          </span>
                          <span className="num text-right text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{pct.toFixed(1)}%</span>
                          <span className="num text-right text-sm font-bold" style={{ color: coins > 0 ? "var(--accent-strong)" : "var(--text-muted)" }}>{coins > 0 ? fmt2(coins) : "—"}</span>
                        </div>
                        {company.teams.filter((t) => showZero || t.pct > 0).map((team) => {
                          const tc = (team.pct / 100) * totalCredits;
                          const isEditing = editingId === team.id;
                          const off = team.pct <= 0;
                          return (
                            <div key={team.id} className="grid items-center px-5 h-[26px] [@media(min-height:860px)]:h-7 text-sm" style={{ gridTemplateColumns: DIST }}>
                              <span className="truncate pl-[18px]" style={{ color: off ? "var(--text-muted)" : "var(--text-secondary)" }} title={team.name}>{team.name}</span>
                              <span className="flex justify-end">
                                {isEditing ? (
                                  <input
                                    type="number" min="0" max="100" step="0.5"
                                    value={editVal}
                                    autoFocus
                                    aria-label={`เปอร์เซ็นต์ของ ${company.name} · ${team.name}`}
                                    onChange={(e) => setEditVal(e.target.value)}
                                    onBlur={() => commitEdit(team.id)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); commitEdit(team.id); }
                                      if (e.key === "Escape") setEditingId(null);
                                    }}
                                    className="num w-16 text-right text-sm rounded-md border px-1.5 outline-none"
                                    style={{ borderColor: "var(--accent)", color: "var(--text-primary)", background: "var(--bg-card)" }}
                                  />
                                ) : (
                                  <button type="button" onClick={() => startEdit(team)} title="คลิกเพื่อแก้ %"
                                    className="num -mr-1.5 rounded-md px-1.5 text-right transition-colors hover:bg-[var(--accent-light)]"
                                    style={{ color: off ? "var(--text-muted)" : "var(--text-primary)" }}>
                                    {team.pct.toFixed(1)}%
                                  </button>
                                )}
                              </span>
                              <span className="num text-right" style={{ color: off ? "var(--text-muted)" : "var(--text-primary)" }}>{off ? "—" : fmt2(tc)}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
            </div>
          </section>

          {/* ── Right: last month + notes ── */}
          <div className="flex flex-col gap-4 lg:min-h-0">
            <section className="surface overflow-hidden shrink-0" aria-label="เทียบกับเดือนก่อน">
              <div className="grid items-end px-4 pt-3 pb-2 border-b text-xs" style={{ gridTemplateColumns: CMP, borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>เทียบเดือนก่อน</span>
                <span className="text-right">{THAI_MONTHS_SHORT[pm - 1]} ได้</span>
                <span className="text-right">ใช้จริง</span>
                <span className="text-right font-semibold" style={{ color: "var(--accent-strong)" }}>{THAI_MONTHS_SHORT[month - 1]} ใหม่</span>
              </div>
              <ul>
                {summaryGroups.filter((g) => showZero || (prevAlloc[g] ?? 0) > 0 || (prevUsage[g]?.used ?? 0) > 0 || (currentAlloc[g] ?? 0) > 0).map((group, gi) => {
                  const prevA = prevAlloc[group] ?? 0;
                  const used  = prevUsage[group]?.used ?? null;
                  const newC  = currentAlloc[group] ?? 0;
                  const over  = used !== null && prevA > 0 && used > prevA;
                  return (
                    <li key={group} className="grid items-center px-4 h-[30px] text-xs"
                      style={{ gridTemplateColumns: CMP, borderTop: gi > 0 ? "1px solid var(--border)" : undefined }}>
                      <span className="truncate" style={{ color: "var(--text-primary)" }} title={group}>{group}</span>
                      <span className="num text-right" style={{ color: "var(--text-secondary)" }}>{prevA > 0 ? prevA.toFixed(2) : "—"}</span>
                      <span className="num text-right" style={{ color: prevLoading || used === null ? "var(--text-muted)" : over ? "var(--danger)" : "var(--text-primary)", fontWeight: over ? 600 : undefined }}>
                        {prevLoading ? "…" : used !== null ? used.toFixed(2) : "—"}
                      </span>
                      <span className="num text-right text-sm font-bold" style={{ color: newC > 0 ? "var(--accent-strong)" : "var(--text-muted)" }}>{newC > 0 ? newC.toFixed(2) : "—"}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="grid items-center px-4 h-9 text-xs text-white" style={{ gridTemplateColumns: CMP, background: "var(--bg-dark)" }}>
                <span className="font-semibold">รวม</span>
                <span className="num text-right" style={{ color: "rgba(255,255,255,0.7)" }}>{fmt2(prevTotalCredits)}</span>
                <span className="num text-right">{prevLoading ? "…" : prevUsedTotal ? fmt2(prevUsedTotal) : "—"}</span>
                <span className="num text-right text-sm font-bold" style={{ color: "#FFB599" }}>{fmt2(totalCredits)}</span>
              </div>
            </section>

            <section className="surface overflow-hidden flex flex-col lg:flex-1 lg:min-h-[120px]" aria-label="โน้ต / หมายเหตุ">
              <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: "var(--border)" }}>
                <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>โน้ต</h2>
                <span className="text-xs" role="status" style={{ color: noteSyncStatus === "error" ? "var(--danger)" : noteSyncStatus === "saved" ? "var(--success)" : "var(--text-secondary)" }}>{noteStatus}</span>
                {isPastMonth ? (
                  <span className="ml-auto text-xs" style={{ color: "var(--text-secondary)" }}>{IS_BETA ? "🔒 โหมดทดสอบ · แก้ไม่ได้" : "🔒 เดือนที่ผ่านมา"}</span>
                ) : (
                  <button type="button" onClick={saveNotes} className="btn-primary ml-auto rounded-lg px-3.5 py-1 text-xs font-semibold">บันทึก</button>
                )}
              </div>
              <textarea
                value={notes}
                onChange={(e) => !isPastMonth && setNotes(e.target.value)}
                readOnly={isPastMonth}
                aria-label="โน้ต / หมายเหตุ"
                placeholder={isPastMonth ? "ไม่มีโน้ตบันทึกไว้สำหรับเดือนนี้" : "พิมพ์หรือวางโน้ตเพิ่มเติมสำหรับเดือนนี้…"}
                className="flex-1 w-full min-h-[100px] resize-none px-4 py-3 text-xs leading-relaxed outline-none"
                style={{ background: isPastMonth ? "var(--bg-page)" : "var(--bg-card)", color: isPastMonth ? "var(--text-secondary)" : "var(--text-primary)", fontFamily: "inherit" }}
              />
            </section>
          </div>
        </div>
      </div>
    </div>
    </AdminGate>
  );
}
