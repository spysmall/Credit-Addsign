"use client";

import { useState } from "react";
import { TEAM_MEMBERS, TeamMember } from "@/lib/team";
import { WorkdayInfo, hoursToCredits } from "@/lib/workdays";
import HolidayEditor from "./HolidayEditor";

interface MemberState {
  timeOffHours: number;
  customHours?: number;
}

export default function CreditOriginTable({ workdayInfo }: { workdayInfo: WorkdayInfo }) {
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

  const [editingLead, setEditingLead] = useState(false);
  const [leadInput, setLeadInput] = useState("");

  const getBase = (m: TeamMember) =>
    m.isLead ? (memberStates[m.id]?.customHours ?? workdayInfo.workingHours) : workdayInfo.workingHours;

  const setTimeOff = (id: string, h: number) =>
    setMemberStates((p) => ({ ...p, [id]: { ...p[id], timeOffHours: h } }));

  const saveLeadHours = (h: number) => {
    const lead = TEAM_MEMBERS.find((m) => m.isLead);
    if (!lead) return;
    setMemberStates((p) => ({ ...p, [lead.id]: { ...p[lead.id], customHours: h } }));
    setEditingLead(false);
  };

  const active = TEAM_MEMBERS.filter((m) => !m.excludeFromCredits);
  const excluded = TEAM_MEMBERS.filter((m) => m.excludeFromCredits);
  const totalHours = active.reduce((s, m) => s + Math.max(0, getBase(m) - (memberStates[m.id]?.timeOffHours ?? 0)), 0);
  const totalCredits = hoursToCredits(totalHours);

  return (
    <div className="rounded-2xl overflow-hidden border shadow-sm"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>

      {/* ─── DESKTOP TABLE (md+) ─── */}
      <div className="hidden md:block">
        {/* Header */}
        <div className="grid border-b"
          style={{ gridTemplateColumns: "1fr 110px 110px 110px 100px", borderColor: "var(--border)", background: "#FAFAFA" }}>
          <ColHead className="px-5 py-3.5 text-left" style={{ color: "var(--text-muted)" }}>สมาชิก</ColHead>
          <ColHead className="px-4 py-3.5 text-center" style={{ color: "var(--text-muted)" }}>
            Working<sub className="block normal-case font-medium tracking-normal text-[10px] not-italic">hrs / month</sub>
          </ColHead>
          <ColHead className="px-4 py-3.5 text-center" style={{ color: "var(--accent)", background: "var(--accent-light)" }}>
            Time Off<sub className="block normal-case font-medium tracking-normal text-[10px] not-italic opacity-70">คลิกเพื่อแก้ไข</sub>
          </ColHead>
          <ColHead className="px-4 py-3.5 text-center" style={{ color: "var(--text-muted)" }}>
            Remaining<sub className="block normal-case font-medium tracking-normal text-[10px] not-italic">ชั่วโมงสุทธิ</sub>
          </ColHead>
          <ColHead className="px-4 py-3.5 text-center" style={{ color: "#fff", background: "var(--bg-dark)" }}>
            M Coin<sub className="block normal-case font-medium tracking-normal text-[10px] not-italic opacity-60">เครดิต</sub>
          </ColHead>
        </div>

        {/* Active rows */}
        {active.map((m, i) => {
          const base = getBase(m);
          const off = memberStates[m.id]?.timeOffHours ?? 0;
          const remaining = Math.max(0, base - off);
          const credits = hoursToCredits(remaining);
          const deducted = off > 0;
          return (
            <div key={m.id} className="grid border-b transition-colors hover:bg-[#FFF8F5]"
              style={{ gridTemplateColumns: "1fr 110px 110px 110px 100px", borderColor: "var(--border)", background: i % 2 === 0 ? "var(--bg-card)" : "#FEFEFE" }}>
              {/* Member */}
              <div className="px-5 py-3.5 flex items-center gap-3">
                <Avatar member={m} />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm leading-tight" style={{ color: "var(--text-primary)" }}>{m.fullName}</p>
                    {m.isLead && <LeadBadge />}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>({m.nickname})</p>
                </div>
              </div>
              {/* Working hrs */}
              <div className="px-4 py-3.5 flex items-center justify-center">
                <WorkingHrsCell m={m} base={base} editingLead={editingLead} leadInput={leadInput}
                  setLeadInput={setLeadInput} setEditingLead={setEditingLead} saveLeadHours={saveLeadHours} />
              </div>
              {/* Time off */}
              <div className="px-4 py-3.5 flex items-center justify-center cursor-pointer group"
                style={{ background: deducted ? "var(--accent-light)" : "transparent" }}>
                <div className="relative flex items-center gap-1">
                  <HolidayEditor memberId={m.id} memberName={`${m.fullName} (${m.nickname})`}
                    currentTimeOffHours={off} maxHours={base} onUpdate={setTimeOff} />
                  {!deducted && (
                    <span className="text-[10px] opacity-0 group-hover:opacity-40 transition-opacity select-none"
                      style={{ color: "var(--accent)" }}>✏</span>
                  )}
                </div>
              </div>
              {/* Remaining */}
              <div className="px-4 py-3.5 flex items-center justify-center">
                <span className="font-bold text-base" style={{ color: deducted ? "var(--accent)" : "var(--text-primary)" }}>
                  {remaining}
                </span>
              </div>
              {/* M Coin */}
              <div className="px-4 py-3.5 flex items-center justify-center" style={{ background: "#FAFAFA" }}>
                <MCoinBadge value={credits} />
              </div>
            </div>
          );
        })}

        {/* Excluded */}
        {excluded.map((m) => (
          <div key={m.id} className="grid border-b"
            style={{ gridTemplateColumns: "1fr 110px 110px 110px 100px", borderColor: "var(--border)", background: "#FAFAFA" }}>
            <div className="px-5 py-3 flex items-center gap-3 opacity-40">
              <Avatar member={m} muted />
              <div>
                <p className="font-semibold text-sm" style={{ color: "var(--text-secondary)" }}>{m.fullName}</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>({m.nickname})</p>
              </div>
            </div>
            <div className="col-span-4 flex items-center justify-center px-4 py-3">
              <AIBadge />
            </div>
          </div>
        ))}

        {/* Total */}
        <div className="grid" style={{ gridTemplateColumns: "1fr 110px 110px 110px 100px", background: "var(--bg-dark)" }}>
          <div className="px-5 py-4 col-span-3 flex items-center">
            <span className="text-xs font-black uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>Total Working Hours</span>
          </div>
          <div className="px-4 py-4 flex items-center justify-center">
            <span className="font-black text-xl" style={{ color: "var(--accent)" }}>{totalHours}</span>
          </div>
          <div className="px-4 py-4 flex items-center justify-center" style={{ background: "var(--accent)" }}>
            <span className="font-black text-2xl text-white">{totalCredits}</span>
          </div>
        </div>
      </div>

      {/* ─── MOBILE CARDS (< md) ─── */}
      <div className="md:hidden">
        {/* Mobile col labels */}
        <div className="grid grid-cols-3 border-b px-4 py-2.5"
          style={{ borderColor: "var(--border)", background: "#FAFAFA" }}>
          <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Working</p>
          <p className="text-[10px] font-black uppercase tracking-wider text-center"
            style={{ color: "var(--accent)" }}>Time Off</p>
          <p className="text-[10px] font-black uppercase tracking-wider text-right" style={{ color: "var(--text-muted)" }}>M Coin</p>
        </div>

        {/* Active cards */}
        {active.map((m, i) => {
          const base = getBase(m);
          const off = memberStates[m.id]?.timeOffHours ?? 0;
          const remaining = Math.max(0, base - off);
          const credits = hoursToCredits(remaining);
          const deducted = off > 0;
          return (
            <div key={m.id} className="border-b px-4 py-3.5"
              style={{ borderColor: "var(--border)", background: i % 2 === 0 ? "var(--bg-card)" : "#FEFEFE" }}>
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
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>({m.nickname})</p>
                </div>
                <MCoinBadge value={credits} />
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2">
                {/* Working */}
                <div className="rounded-xl p-3 text-center" style={{ background: "#F5F5F5" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Working</p>
                  <WorkingHrsCell m={m} base={base} editingLead={editingLead} leadInput={leadInput}
                    setLeadInput={setLeadInput} setEditingLead={setEditingLead} saveLeadHours={saveLeadHours} />
                  <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>ชั่วโมง</p>
                </div>

                {/* Time off */}
                <div className="rounded-xl p-3 text-center"
                  style={{ background: deducted ? "var(--accent-light)" : "#F5F5F5" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide mb-1"
                    style={{ color: deducted ? "var(--accent)" : "var(--text-muted)" }}>Time Off</p>
                  <HolidayEditor memberId={m.id} memberName={`${m.fullName} (${m.nickname})`}
                    currentTimeOffHours={off} maxHours={base} onUpdate={setTimeOff} />
                  <p className="text-[10px] mt-0.5" style={{ color: deducted ? "var(--accent)" : "var(--text-muted)" }}>
                    {deducted ? "ชั่วโมง" : "แตะเพื่อแก้ไข"}
                  </p>
                </div>

                {/* Remaining */}
                <div className="rounded-xl p-3 text-center" style={{ background: "#F5F5F5" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Remaining</p>
                  <p className="font-bold text-base leading-none"
                    style={{ color: deducted ? "var(--accent)" : "var(--text-primary)" }}>
                    {remaining}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>ชั่วโมง</p>
                </div>
              </div>
            </div>
          );
        })}

        {/* Excluded */}
        {excluded.map((m) => (
          <div key={m.id} className="border-b px-4 py-3.5 flex items-center gap-3"
            style={{ borderColor: "var(--border)", background: "#FAFAFA" }}>
            <Avatar member={m} muted size="sm" />
            <div className="flex-1 min-w-0 opacity-40">
              <p className="font-semibold text-sm truncate" style={{ color: "var(--text-secondary)" }}>{m.fullName}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>({m.nickname})</p>
            </div>
            <AIBadge />
          </div>
        ))}

        {/* Total */}
        <div className="px-4 py-4 flex items-center justify-between" style={{ background: "var(--bg-dark)" }}>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>Total</p>
            <p className="font-black text-xl" style={{ color: "var(--accent)" }}>{totalHours}
              <span className="text-sm font-semibold ml-1 opacity-60">hrs</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>M Coin รวม</p>
            <div className="inline-flex items-center justify-center rounded-xl px-5 py-2"
              style={{ background: "var(--accent)" }}>
              <span className="font-black text-2xl text-white">{totalCredits}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Shared sub-components ── */

function ColHead({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`text-[10px] font-black uppercase tracking-widest flex flex-col items-center justify-center ${className}`} style={style}>
      {children}
    </div>
  );
}

function getInitial(nickname: string): string {
  if (/^[เแโใไ]/.test(nickname)) return nickname.charAt(1);
  return nickname.charAt(0);
}

function Avatar({ member, muted, size = "md" }: { member: TeamMember; muted?: boolean; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "w-8 h-8 text-xs" : "w-9 h-9 text-sm";
  if (muted) return (
    <div className={`${sz} rounded-xl flex items-center justify-center font-black shrink-0`}
      style={{ background: "#E8E8E8", color: "#9A9A9A" }}>
      {getInitial(member.nickname)}
    </div>
  );
  return (
    <div className={`${sz} rounded-xl flex items-center justify-center font-black shrink-0`}
      style={member.isLead ? { background: "var(--accent)", color: "#fff" } : { background: "#F0F0F0", color: "var(--text-primary)" }}>
      {getInitial(member.nickname)}
    </div>
  );
}

function LeadBadge() {
  return (
    <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
      style={{ background: "var(--accent)", color: "#fff" }}>Lead</span>
  );
}

function MCoinBadge({ value }: { value: number }) {
  return (
    <span className="font-black text-base w-11 h-8 rounded-lg flex items-center justify-center shrink-0"
      style={{ background: "var(--bg-dark)", color: "#fff" }}>
      {value}
    </span>
  );
}

function AIBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border shrink-0"
      style={{ color: "var(--text-muted)", borderColor: "var(--border)", background: "var(--bg-card)" }}>
      🤖 ถูกแยกไปทำงาน AI
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
      className={`font-bold text-base leading-none ${m.isLead ? "underline decoration-dashed underline-offset-2" : ""}`}
      style={{ color: "var(--text-primary)", textDecorationColor: "var(--accent)", cursor: m.isLead ? "pointer" : "default" }}>
      {base}
    </button>
  );
}
