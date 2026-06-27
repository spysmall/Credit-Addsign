"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import MonthSelector from "@/components/MonthSelector";
import { getWorkdayInfo, hoursToCredits } from "@/lib/workdays";
import { TEAM_MEMBERS } from "@/lib/team";
import {
  DistConfig, DistTeam,
  DEFAULT_DIST_CONFIG,
  loadDistConfig, saveDistConfig,
  totalPct, computeSummaryCredits, getSummaryGroups,
} from "@/lib/distribution";
import { fetchAllTaskUsage, TeamUsage } from "@/lib/sheetTasks";
import { fetchDistFromSheet, saveDistToSheet, flattenConfig, fetchNoteFromSheet, saveNoteToSheet } from "@/lib/sheetDistribution";

const THAI_MONTHS_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const notesKey = (y: number, m: number) => `credit-notes-v1-${y}-${m}`;

function prevYM(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function teamTotalCreditsForMonth(y: number, m: number): number {
  const info = getWorkdayInfo(y, m);
  const active = TEAM_MEMBERS.filter((mem) => !mem.excludeFromCredits);
  return active.reduce((sum, mem) => {
    const hrs = mem.isLead ? (mem.customHoursPerMonth ?? info.workingHours) : info.workingHours;
    return sum + hoursToCredits(hrs);
  }, 0);
}

export default function CreditDistributionPage() {
  const [year, setYear]   = useState(2026);
  const [month, setMonth] = useState(7);

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

  const totalCredits = teamTotalCreditsForMonth(year, month);
  const sum = totalPct(config);
  const summaryGroups = getSummaryGroups(config);

  // Credits per summary group for current month
  const currentAlloc = computeSummaryCredits(config, totalCredits);

  // Previous month credits
  const { year: py, month: pm } = prevYM(year, month);
  const prevTotalCredits = teamTotalCreditsForMonth(py, pm);
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
  const isPastMonth = year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1);

  return (
    <div style={{ background: "var(--bg-page)", minHeight: "calc(100vh - 56px)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">

        {/* ── Page Header ── */}
        <div className="mb-4 sm:mb-6">
          {/* Top row: label + sync status + month selector */}
          <div className="flex items-start justify-between gap-4 mb-3 sm:mb-4">
            <p className="text-xs font-black uppercase tracking-[0.15em] pt-1"
              style={{ color: "var(--accent)" }}>Credit Distribution</p>
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
              {!isPastMonth && syncStatus === "idle" && (
                <button
                  onClick={() => {
                    setSyncStatus("saving");
                    saveDistToSheet(year, month, flattenConfig(config))
                      .then((ok) => setSyncStatus(ok ? "saved" : "error"))
                      .catch(() => setSyncStatus("error"));
                  }}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all hover:opacity-80"
                  style={{ borderColor: "var(--border)", color: "var(--text-muted)", background: "var(--bg-card)" }}>
                  ↑ Sync to Sheet
                </button>
              )}
              <MonthSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
            </div>
          </div>
          {/* Heading */}
          <h1 className="text-3xl sm:text-4xl font-black leading-none tracking-tight"
            style={{ color: "var(--text-primary)" }}>
            {THAI_MONTHS_SHORT[month - 1]}{" "}
            <span style={{ color: "var(--accent)" }}>{buddhist}</span>
          </h1>
        </div>

        {/* ── Total bar ── */}
        <div className="flex items-center gap-2 mb-3">
          <div className="rounded-xl px-4 py-2 flex items-center gap-2 shadow-sm"
            style={{ background: "var(--accent)", color: "#fff" }}>
            <span className="text-[10px] font-black uppercase tracking-widest opacity-75">เครดิตรวม</span>
            <span className="font-black text-xl">{totalCredits}</span>
            <span className="text-xs font-semibold opacity-75">M Coin</span>
          </div>
          {sum !== 100 && (
            <div className="rounded-xl px-3 py-2 border text-xs font-semibold"
              style={{ borderColor: "#FBBF24", background: "#FFFBEB", color: "#92400E" }}>
              ⚠ รวม {sum.toFixed(1)}% {sum < 100 ? `(ขาด ${(100 - sum).toFixed(1)}%)` : `(เกิน ${(sum - 100).toFixed(1)}%)`}
            </div>
          )}
          {sum === 100 && (
            <div className="rounded-xl px-3 py-2 border text-xs font-semibold"
              style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text-muted)" }}>
              ✓ รวม 100% พอดี
            </div>
          )}
        </div>

        {/* ── Notes ── */}
        <div className="mb-4 rounded-xl border overflow-hidden"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
          <div className="px-4 py-2 border-b flex items-center justify-between"
            style={{ borderColor: "var(--border)", background: "var(--bg-page)" }}>
            <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>📝 โน้ต / หมายเหตุ</span>
            <span className="text-[10px]" style={{
              color: noteSyncStatus === "saving" ? "var(--text-muted)"
                   : noteSyncStatus === "saved"  ? "#22C55E"
                   : noteSyncStatus === "error"  ? "#EF4444"
                   : "transparent"
            }}>
              {noteSyncStatus === "saving" && "⏳ กำลังบันทึก…"}
              {noteSyncStatus === "saved"  && "✓ บันทึกแล้ว"}
              {noteSyncStatus === "error"  && "⚠ บันทึกไม่สำเร็จ"}
            </span>
          </div>
          <div className="relative">
            <textarea
              value={notes}
              onChange={(e) => !isPastMonth && setNotes(e.target.value)}
              readOnly={isPastMonth}
              placeholder={isPastMonth ? "ไม่มีโน้ตบันทึกไว้สำหรับเดือนนี้" : "พิมพ์หรือวางโน้ตเพิ่มเติมที่ต้องการบันทึกไว้สำหรับเดือนนี้…"}
              rows={3}
              className="w-full resize-y px-4 py-3 text-sm outline-none"
              style={{
                background: isPastMonth ? "var(--bg-page)" : "var(--bg-card)",
                color: isPastMonth ? "var(--text-secondary)" : "var(--text-primary)",
                fontFamily: "inherit",
                minHeight: "96px",
                cursor: isPastMonth ? "default" : "text",
                paddingBottom: isPastMonth ? "12px" : "48px",
                resize: isPastMonth ? "none" : "vertical",
              }}
            />
            {!isPastMonth && (
              <button
                onClick={() => {
                  if (noteTimer.current) clearTimeout(noteTimer.current);
                  setNoteSyncStatus("saving");
                  localStorage.setItem(notesKey(year, month), notes);
                  saveNoteToSheet(year, month, notes)
                    .then((ok) => setNoteSyncStatus(ok ? "saved" : "error"))
                    .catch(() => setNoteSyncStatus("error"));
                }}
                className="absolute bottom-3 right-3 px-4 py-1.5 rounded-lg text-xs font-bold transition-all hover:opacity-90"
                style={{ background: "var(--accent)", color: "#fff" }}>
                บันทึก
              </button>
            )}
            {isPastMonth && (
              <div className="absolute bottom-2 right-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
                🔒 เดือนที่ผ่านมา
              </div>
            )}
          </div>
        </div>

        {/* ── Main layout ── */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_540px] gap-4 sm:gap-6 items-start">

          {/* ── Distribution Table ── */}
          <div className="rounded-2xl overflow-hidden border shadow-sm"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>

            {/* Table header */}
            <div className="grid border-b"
              style={{ gridTemplateColumns: "1fr 92px 92px", borderColor: "var(--border)", background: "#FAFAFA" }}>
              <div className="px-5 py-2 text-xs font-black uppercase tracking-widest flex items-center"
                style={{ color: "var(--text-muted)" }}>ทีม / บริษัท</div>
              <div className="px-4 py-2 text-xs font-black uppercase tracking-widest flex items-center justify-center"
                style={{ color: "var(--text-muted)", background: "var(--bg-card)" }}>%</div>
              <div className="px-4 py-2 text-xs font-black uppercase tracking-widest flex items-center justify-center"
                style={{ color: "#fff", background: "var(--bg-dark)" }}>
                M Coin
              </div>
            </div>

            {config.map((priority) => {
              const priorityPct  = priority.companies.flatMap((c) => c.teams).reduce((s, t) => s + t.pct, 0);
              const priorityCoins = Math.round((priorityPct / 100) * totalCredits * 100) / 100;
              return (
                <div key={priority.id}>
                  {/* Priority row */}
                  <div className="grid border-b"
                    style={{ gridTemplateColumns: "1fr 92px 92px", borderColor: "var(--border)", background: priority.bgColor }}>
                    <div className="px-5 py-1 flex items-center">
                      <span className="text-xs font-black" style={{ color: priority.textColor }}>{priority.name}</span>
                    </div>
                    <div className="px-4 py-1 flex items-center justify-center">
                      <span className="text-xs font-black tracking-wide" style={{ color: priority.textColor }}>
                        {priorityPct.toFixed(2)}%
                      </span>
                    </div>
                    <div className="px-4 py-1 flex items-center justify-center">
                      <span className="text-xs font-black" style={{ color: priority.textColor }}>{priorityCoins}</span>
                    </div>
                  </div>

                  {priority.companies.map((company) => {
                    const companyPct   = company.teams.reduce((s, t) => s + t.pct, 0);
                    const companyCoins = Math.round((companyPct / 100) * totalCredits * 100) / 100;
                    return (
                      <div key={company.id}>
                        {/* Company row */}
                        <div className="grid border-b"
                          style={{ gridTemplateColumns: "1fr 92px 92px", borderColor: "var(--border)", background: "#F5F0EE" }}>
                          <div className="px-5 py-0.5 flex items-center">
                            <span className="text-xs font-black uppercase tracking-wide"
                              style={{ color: "var(--text-secondary)" }}>{company.name}</span>
                          </div>
                          <div className="px-4 py-0.5 flex items-center justify-center">
                            <span className="text-xs font-medium tracking-wide" style={{ color: "var(--text-secondary)" }}>
                              {companyPct.toFixed(2)}%
                            </span>
                          </div>
                          <div className="px-4 py-0.5 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.03)" }}>
                            <span className="text-xs font-medium tracking-wide" style={{ color: "var(--text-secondary)" }}>{companyCoins}</span>
                          </div>
                        </div>

                        {/* Team rows */}
                        {company.teams.map((team, ti) => {
                          const coins = Math.round((team.pct / 100) * totalCredits * 100) / 100;
                          const isEditing = editingId === team.id;
                          return (
                            <div key={team.id} className="grid border-b transition-colors hover:bg-[#FFF8F5]"
                              style={{
                                gridTemplateColumns: "1fr 92px 92px",
                                borderColor: "var(--border)",
                                background: ti % 2 === 0 ? "var(--bg-card)" : "#FEFEFE",
                              }}>
                              {/* Name */}
                              <div className="px-6 py-1 flex items-center">
                                <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                                  - {team.name}
                                </span>
                              </div>
                              {/* % editable */}
                              <div className="px-4 py-1 flex items-center justify-center"
                                style={{ background: "var(--bg-card)" }}>
                                {isEditing ? (
                                  <input
                                    type="number" min="0" max="100" step="0.5"
                                    value={editVal}
                                    autoFocus
                                    onChange={(e) => setEditVal(e.target.value)}
                                    onBlur={() => commitEdit(team.id)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); commitEdit(team.id); }
                                      if (e.key === "Escape") setEditingId(null);
                                    }}
                                    className="w-16 text-center text-xs font-semibold rounded border px-2 py-1 focus:outline-none"
                                    style={{ borderColor: "var(--border)", color: "var(--text-secondary)", background: "#fff" }}
                                  />
                                ) : (
                                  <button
                                    onClick={() => startEdit(team)}
                                    className="text-xs font-medium tracking-wide rounded px-2 py-1 transition-all hover:bg-gray-100"
                                    style={{ color: "var(--text-secondary)" }}>
                                    {team.pct.toFixed(2)}%
                                  </button>
                                )}
                              </div>
                              {/* Coins */}
                              <div className="px-4 py-1 flex items-center justify-center" style={{ background: "var(--accent-light)" }}>
                                <span className="font-black text-sm"
                                  style={{ color: "var(--accent)" }}>{coins}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Total row */}
            <div className="grid" style={{ gridTemplateColumns: "1fr 92px 92px", background: "var(--bg-dark)" }}>
              <div className="px-5 py-2 flex items-center col-span-1">
                <span className="text-xs font-black uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Total
                </span>
              </div>
              <div className="px-4 py-2 flex items-center justify-center">
                <span className="font-black text-xs tracking-wide" style={{ color: sum === 100 ? "var(--accent)" : "#FBBF24" }}>
                  {sum.toFixed(2)}%
                </span>
              </div>
              <div className="px-4 py-2 flex items-center justify-center" style={{ background: "var(--accent)" }}>
                <span className="font-black text-xl text-white">{totalCredits}</span>
              </div>
            </div>
          </div>

          {/* ── Right Panel: Previous month summary ── */}
          <aside>
            <div className="rounded-2xl overflow-hidden border shadow-sm"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>

              {/* Panel header */}
              <div className="border-b" style={{ borderColor: "var(--border)" }}>
                <div className="grid" style={{ gridTemplateColumns: "1fr 121px 110px" }}>
                  <div className="px-4 py-2 flex items-end" style={{ background: "#FAFAFA" }}>
                    <span className="text-xs font-black uppercase tracking-widest"
                      style={{ color: "var(--text-muted)" }}>ทีม</span>
                  </div>
                  {/* Previous month header */}
                  <div className="px-2 py-1.5 text-center" style={{ background: "#FAFAFA" }}>
                    <div className="text-xs font-black uppercase tracking-wider mb-0.5"
                      style={{ color: "var(--text-muted)" }}>
                      {THAI_MONTHS_SHORT[pm - 1]} {py + 543}
                    </div>
                    <div className="grid grid-cols-2 gap-0.5">
                      <span className="text-xs text-center" style={{ color: "var(--text-muted)" }}>ที่มี</span>
                      <span className="text-xs text-center" style={{ color: "var(--accent)" }}>ใช้ไป</span>
                    </div>
                  </div>
                  {/* Current month header */}
                  <div className="px-2 py-1.5 text-center"
                    style={{ background: "var(--accent)", borderLeft: "2px solid var(--accent)" }}>
                    <div className="text-xs font-black uppercase tracking-wider mb-0.5 text-white/75">
                      {THAI_MONTHS_SHORT[month - 1]} {buddhist}
                    </div>
                    <div className="text-xs text-white/90 font-semibold">เครดิตใหม่</div>
                  </div>
                </div>
              </div>

              {/* Data rows */}
              {summaryGroups.map((group, gi) => {
                const prevA = prevAlloc[group] ?? 0;
                const used  = prevUsage[group]?.used ?? null;
                const newC  = currentAlloc[group] ?? 0;
                return (
                  <div key={group} className="grid border-b"
                    style={{
                      gridTemplateColumns: "1fr 121px 110px",
                      borderColor: "var(--border)",
                      background: gi % 2 === 0 ? "var(--bg-card)" : "#FEFEFE",
                    }}>
                    <div className="px-4 py-1.5 flex items-center gap-1.5">
                      <span className="text-xs font-medium leading-snug" style={{ color: "var(--text-primary)" }}>
                        {group}
                      </span>
                      {(prevUsage[group]?.count ?? 0) > 0 && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                          {prevUsage[group]!.count} ชิ้น
                        </span>
                      )}
                    </div>
                    {/* Prev month: allocated | used */}
                    <div className="px-1 py-1.5 grid grid-cols-2 gap-0.5 items-center">
                      <span className="text-xs font-semibold text-center" style={{ color: "var(--text-secondary)" }}>
                        {prevA > 0 ? prevA.toFixed(2) : "—"}
                      </span>
                      <span className="text-xs font-semibold text-center"
                        style={{ color: prevLoading ? "var(--text-muted)" : used !== null ? "var(--accent)" : "var(--text-muted)" }}>
                        {prevLoading ? "…" : used !== null ? used.toFixed(2) : "—"}
                      </span>
                    </div>
                    {/* Current month: new allocation */}
                    <div className="px-2 py-1.5 flex items-center justify-center"
                      style={{ background: "var(--accent-light)", borderLeft: "2px solid var(--accent)" }}>
                      <span className="text-sm font-black" style={{ color: "var(--accent)" }}>
                        {newC > 0 ? newC.toFixed(2) : "—"}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Summary totals */}
              <div className="grid border-t" style={{ gridTemplateColumns: "1fr 121px 110px", borderColor: "var(--border)", background: "var(--bg-dark)" }}>
                <div className="px-4 py-2 flex items-center">
                  <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>
                    รวม
                  </span>
                </div>
                <div className="px-1 py-2 grid grid-cols-2 gap-0.5 items-center">
                  <span className="text-xs font-black text-center" style={{ color: "rgba(255,255,255,0.7)" }}>
                    {prevTotalCredits}
                  </span>
                  <span className="text-xs font-black text-center" style={{ color: "var(--accent)" }}>
                    {prevLoading ? "…" : Object.values(prevUsage).reduce((s, v) => Math.round((s + v.used) * 100) / 100, 0) || "—"}
                  </span>
                </div>
                <div className="px-2 py-2 flex items-center justify-center"
                  style={{ background: "var(--accent)", borderLeft: "2px solid var(--accent)" }}>
                  <span className="font-black text-base text-white">{totalCredits}</span>
                </div>
              </div>

              {/* Footer note */}
              <div className="px-4 py-2 border-t" style={{ borderColor: "var(--border)", background: "#FAFAFA" }}>
                <p className="text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  <span className="font-semibold">ที่มี</span> = เครดิตจัดสรรเดือน{THAI_MONTHS_SHORT[pm - 1]} ·{" "}
                  <span className="font-semibold">ใช้ไป</span> = จากงานจริงใน Notion ·{" "}
                  <span className="font-semibold" style={{ color: "var(--accent)" }}>เครดิตใหม่</span> = จัดสรรเดือนนี้
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
