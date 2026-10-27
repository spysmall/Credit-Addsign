"use client";

import { useState, useEffect } from "react";
import { TEAM_MEMBERS, TeamMember } from "@/lib/team";
import { WorkdayInfo, hoursToCredits } from "@/lib/workdays";
import { fetchLeaveHours } from "@/lib/sheetLeave";
import HolidayEditor from "./HolidayEditor";

interface MemberState {
  timeOffHours: number;
  customHours?: number;
}

interface Props {
  workdayInfo: WorkdayInfo;
  year: number;
  month: number;
  /** reports this month's team total after leave; `simulated` = someone edited a number by hand */
  onTotalChange?: (credits: number, simulated: boolean) => void;
}

export default function CreditOriginTable({ workdayInfo, year, month, onTotalChange }: Props) {
  const [memberStates, setMemberStates] = useState<Record<string, MemberState>>(() => {
    const init: Record<string, MemberState> = {};
    TEAM_MEMBERS.forEach((m) => {
      init[m.id] = {
        timeOffHours: 0,
        customHours: m.isLead ? (m.customHoursPerMonth ?? workdayInfo.workingHours) : undefined,
      };
    });
    return init;
  });

  const [sheetLoading, setSheetLoading] = useState(true);
  const [simulated, setSimulated] = useState(false);
  const [sheetError, setSheetError] = useState(false);

  const loadLeave = (y: number, m: number) => {
    setSheetLoading(true);
    setSheetError(false);
    fetchLeaveHours(y, m)
      .then((data) => {
        setMemberStates((prev) => {
          const next = { ...prev };
          for (const [id, hours] of Object.entries(data)) {
            next[id] = { ...next[id], timeOffHours: hours };
          }
          // Reset members not in data to 0
          for (const m of TEAM_MEMBERS) {
            if (!(m.id in data)) {
              next[m.id] = { ...next[m.id], timeOffHours: 0 };
            }
          }
          return next;
        });
      })
      .catch(() => setSheetError(true))
      .finally(() => setSheetLoading(false));
  };

  useEffect(() => {
    loadLeave(year, month);
  }, [year, month]);

  const [editingLead, setEditingLead] = useState(false);
  const [leadInput, setLeadInput] = useState("");

  const getBase = (m: TeamMember) =>
    m.isLead ? (memberStates[m.id]?.customHours ?? workdayInfo.workingHours) : workdayInfo.workingHours;

  const setTimeOff = (id: string, h: number) => {
    setMemberStates((p) => ({ ...p, [id]: { ...p[id], timeOffHours: h } }));
    setSimulated(true);
  };

  const saveLeadHours = (h: number) => {
    const lead = TEAM_MEMBERS.find((m) => m.isLead);
    if (!lead) return;
    setMemberStates((p) => ({ ...p, [lead.id]: { ...p[lead.id], customHours: h } }));
    setEditingLead(false);
    setSimulated(true);
  };

  /** drop hand-edited numbers and go back to the leave sheet + configured lead hours */
  const resetToSheet = () => {
    setMemberStates((p) => {
      const next = { ...p };
      TEAM_MEMBERS.forEach((m) => {
        if (m.isLead) next[m.id] = { ...next[m.id], customHours: m.customHoursPerMonth ?? workdayInfo.workingHours };
      });
      return next;
    });
    setSimulated(false);
    loadLeave(year, month);
  };

  const active = TEAM_MEMBERS.filter((m) => !m.excludeFromCredits);
  const totalHours = active.reduce((s, m) => s + Math.max(0, getBase(m) - (memberStates[m.id]?.timeOffHours ?? 0)), 0);
  const totalCredits = hoursToCredits(totalHours);
  const totalBase = active.reduce((s, m) => s + getBase(m), 0);
  const totalOff = active.reduce((s, m) => s + (memberStates[m.id]?.timeOffHours ?? 0), 0);

  useEffect(() => {
    if (!sheetLoading) onTotalChange?.(totalCredits, simulated);
  }, [totalCredits, simulated, sheetLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const COLS = "minmax(0,1fr) 112px 112px 112px 96px";

  return (
    <div className="surface overflow-hidden">

      {(simulated || sheetError) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-2.5 text-xs border-b" role="status"
          style={sheetError
            ? { background: "var(--danger-bg)", borderColor: "var(--danger-line)", color: "var(--danger)" }
            : { background: "var(--warning-bg)", borderColor: "var(--warning-line)", color: "var(--warning)" }}>
          <span className="font-semibold">
            {sheetError ? "โหลดข้อมูลวันลาจากชีตไม่สำเร็จ" : "กำลังจำลองตัวเลข · ค่าที่แก้ในหน้านี้ไม่ถูกบันทึก และไม่มีผลกับ Dashboard"}
          </span>
          <button type="button" onClick={sheetError ? () => loadLeave(year, month) : resetToSheet} className="font-semibold underline underline-offset-2">
            {sheetError ? "ลองใหม่" : "คืนค่าจากชีต"}
          </button>
        </div>
      )}

      {/* ─── DESKTOP TABLE (md+) ─── */}
      <div className="hidden md:block">
        {/* Header */}
        <div className="grid border-b text-xs" style={{ gridTemplateColumns: COLS, borderColor: "var(--border)", color: "var(--text-secondary)" }}>
          <ColHead className="px-5 py-3 items-start">สมาชิก</ColHead>
          <ColHead className="px-3 py-3">ชั่วโมงทำงาน</ColHead>
          <ColHead className="px-3 py-3">
            <span className="inline-flex items-center gap-1">ลา / หยุด (ชม.){sheetLoading && <span className="animate-pulse" style={{ color: "var(--accent)" }} aria-label="กำลังโหลด">●</span>}</span>
          </ColHead>
          <ColHead className="px-3 py-3">ชั่วโมงสุทธิ</ColHead>
          <ColHead className="px-3 py-3" style={{ color: "var(--accent-strong)" }}>M Coin</ColHead>
        </div>

        {/* Active rows */}
        {active.map((m) => {
          const base = getBase(m);
          const off = memberStates[m.id]?.timeOffHours ?? 0;
          const remaining = Math.max(0, base - off);
          const credits = hoursToCredits(remaining);
          const deducted = off > 0;
          return (
            <div key={m.id} className="grid border-b transition-colors hover:bg-[var(--bg-page)]"
              style={{ gridTemplateColumns: COLS, borderColor: "var(--border)" }}>
              {/* Member */}
              <div className="px-5 py-3.5 flex items-center gap-3">
                <Avatar member={m} />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm leading-tight" style={{ color: "var(--text-primary)" }}>{m.fullName}</p>
                    {m.isLead && <LeadBadge />}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    {m.nickname}{m.isLead && <span> · ชั่วโมงกำหนดเฉพาะ Lead</span>}
                  </p>
                </div>
              </div>
              {/* Working hrs */}
              <div className="px-4 py-3.5 flex items-center justify-center">
                <WorkingHrsCell m={m} base={base} editingLead={editingLead} leadInput={leadInput}
                  setLeadInput={setLeadInput} setEditingLead={setEditingLead} saveLeadHours={saveLeadHours} />
              </div>
              {/* Time off */}
              <div className="px-4 py-3.5 flex items-center justify-center">
                {sheetLoading ? (
                  <span className="text-sm animate-pulse" style={{ color: "var(--text-muted)" }}>…</span>
                ) : (
                  <HolidayEditor memberId={m.id} memberName={`${m.fullName} (${m.nickname})`}
                    currentTimeOffHours={off} maxHours={base} onUpdate={setTimeOff} />
                )}
              </div>
              {/* Remaining */}
              <div className="px-4 py-3.5 flex items-center justify-center">
                <span className="num font-semibold text-base" style={{ color: deducted ? "var(--accent-strong)" : "var(--text-primary)" }}>
                  {remaining}
                </span>
              </div>
              {/* M Coin */}
              <div className="px-4 py-3.5 flex items-center justify-center">
                <MCoinBadge value={credits} />
              </div>
            </div>
          );
        })}


        {/* Total */}
        <div className="grid items-center text-white" style={{ gridTemplateColumns: COLS, background: "var(--bg-dark)" }}>
          <div className="px-5 py-4 text-sm font-semibold">รวมทั้งทีม <span className="font-normal" style={{ color: "rgba(255,255,255,0.7)" }}>· {active.length} คน</span></div>
          <div className="px-3 py-4 text-center num font-semibold">{totalBase.toLocaleString()}</div>
          <div className="px-3 py-4 text-center num font-semibold" style={{ color: totalOff > 0 ? "#FFB599" : "rgba(255,255,255,0.6)" }}>{totalOff > 0 ? totalOff.toLocaleString() : "—"}</div>
          <div className="px-3 py-4 text-center num font-semibold">{totalHours.toLocaleString()}</div>
          <div className="px-3 py-4 flex justify-center">
            <span className="num rounded-lg px-3 py-1.5 text-lg font-bold text-white" style={{ background: "var(--accent)" }}>{totalCredits.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* ─── MOBILE CARDS (< md) ─── */}
      <div className="md:hidden">

        {/* Active cards */}
        {active.map((m) => {
          const base = getBase(m);
          const off = memberStates[m.id]?.timeOffHours ?? 0;
          const remaining = Math.max(0, base - off);
          const credits = hoursToCredits(remaining);
          const deducted = off > 0;
          return (
            <div key={m.id} className="border-b px-4 py-3.5" style={{ borderColor: "var(--border)" }}>
              {/* Member info row */}
              <div className="flex items-center gap-3 mb-3">
                <Avatar member={m} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-semibold text-sm leading-tight truncate" style={{ color: "var(--text-primary)" }}>
                      {m.fullName}
                    </p>
                    {m.isLead && <LeadBadge />}
                  </div>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {m.nickname}{m.isLead && <span> · ชั่วโมงเฉพาะ Lead</span>}
                  </p>
                </div>
                <MCoinBadge value={credits} />
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2">
                {/* Working */}
                <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-page)" }}>
                  <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>ทำงาน</p>
                  <WorkingHrsCell m={m} base={base} editingLead={editingLead} leadInput={leadInput}
                    setLeadInput={setLeadInput} setEditingLead={setEditingLead} saveLeadHours={saveLeadHours} />
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>ชั่วโมง</p>
                </div>

                {/* Time off */}
                <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-page)" }}>
                  <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>ลา / หยุด</p>
                  {sheetLoading ? (
                    <span className="text-sm animate-pulse" style={{ color: "var(--text-muted)" }}>…</span>
                  ) : (
                    <HolidayEditor memberId={m.id} memberName={`${m.fullName} (${m.nickname})`}
                      currentTimeOffHours={off} maxHours={base} onUpdate={setTimeOff} />
                  )}
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    {sheetLoading ? "กำลังโหลด…" : "ชั่วโมง"}
                  </p>
                </div>

                {/* Remaining */}
                <div className="rounded-xl p-3 text-center" style={{ background: "var(--bg-page)" }}>
                  <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>สุทธิ</p>
                  <p className="font-bold text-base leading-none"
                    style={{ color: deducted ? "var(--accent-strong)" : "var(--text-primary)" }}>
                    {remaining}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>ชั่วโมง</p>
                </div>
              </div>
            </div>
          );
        })}


        {/* Total */}
        <div className="px-4 py-4 flex items-center justify-between text-white" style={{ background: "var(--bg-dark)" }}>
          <p className="text-sm font-semibold">รวมทั้งทีม <span className="num font-normal" style={{ color: "rgba(255,255,255,0.7)" }}>· สุทธิ {totalHours.toLocaleString()} ชม.</span></p>
          <span className="num rounded-lg px-3 py-1.5 text-lg font-bold text-white" style={{ background: "var(--accent)" }}>{totalCredits.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Shared sub-components ── */

function ColHead({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`font-medium flex flex-col items-center justify-center text-center ${className}`} style={style}>
      {children}
    </div>
  );
}

function getInitial(nickname: string): string {
  if (/^[เแโใไ]/.test(nickname)) return nickname.charAt(1);
  return nickname.charAt(0);
}

function Avatar({ member, size = "md" }: { member: TeamMember; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "w-8 h-8 text-xs" : "w-9 h-9 text-sm";
  return (
    <div className={`${sz} rounded-full flex items-center justify-center font-bold shrink-0`}
      style={member.isLead ? { background: "var(--bg-dark)", color: "#fff" } : { background: "var(--accent-light)", color: "var(--accent-strong)" }}>
      {getInitial(member.nickname)}
    </div>
  );
}

function LeadBadge() {
  return (
    <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md shrink-0"
      style={{ background: "var(--bg-dark)", color: "#fff" }}>Lead</span>
  );
}

function MCoinBadge({ value }: { value: number }) {
  return (
    <span className="num font-bold text-base min-w-11 h-8 px-2 rounded-lg flex items-center justify-center shrink-0"
      style={{ background: "var(--accent-light)", color: "var(--accent-strong)" }}>
      {value}
    </span>
  );
}

function WorkingHrsCell({ m, base, editingLead, leadInput, setLeadInput, setEditingLead, saveLeadHours }: {
  m: TeamMember; base: number; editingLead: boolean; leadInput: string;
  setLeadInput: (v: string) => void; setEditingLead: (v: boolean) => void; saveLeadHours: (h: number) => void;
}) {
  if (m.isLead && editingLead) {
    return (
      <div className="flex items-center gap-1 justify-center">
        <input type="number" min="0" value={leadInput}
          onChange={(e) => setLeadInput(e.target.value)}
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") saveLeadHours(Number(leadInput)); if (e.key === "Escape") setEditingLead(false); }}
          className="w-14 border rounded-lg px-2 py-1 text-sm text-center font-bold focus:outline-none"
          style={{ borderColor: "var(--accent)", color: "var(--text-primary)" }}
        />
        <button onClick={() => saveLeadHours(Number(leadInput))} className="text-xs font-bold" style={{ color: "var(--accent)" }}>✓</button>
      </div>
    );
  }
  return (
    <button
      onClick={m.isLead ? () => { setLeadInput(String(base)); setEditingLead(true); } : undefined}
      title={m.isLead ? "คลิกเพื่อลองปรับชั่วโมงของ Lead (จำลอง)" : undefined}
      className={`num font-semibold text-base leading-none ${m.isLead ? "underline decoration-dashed underline-offset-4" : ""}`}
      style={{ color: "var(--text-primary)", textDecorationColor: "var(--accent)", cursor: m.isLead ? "pointer" : "default" }}>
      {base}
    </button>
  );
}
