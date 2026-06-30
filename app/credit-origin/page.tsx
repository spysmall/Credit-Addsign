"use client";

import { useState } from "react";
import MonthSelector from "@/components/MonthSelector";
import CreditOriginTable from "@/components/CreditOriginTable";
import { getWorkdayInfo, hoursToCredits } from "@/lib/workdays";
import { getHolidaysForMonth } from "@/lib/holidays";
import { TEAM_MEMBERS } from "@/lib/team";
import AdminGate from "@/components/AdminGate";

const THAI_MONTHS_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const DAYS_TH = ["อา.","จ.","อ.","พ.","พฤ.","ศ.","ส."];

function formatThaiDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return `${DAYS_TH[dow]}ที่ ${d} ${THAI_MONTHS_SHORT[m - 1]} ${y + 543}`;
}

export default function CreditOriginPage() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(7);

  const info = getWorkdayInfo(year, month);
  const holidays = getHolidaysForMonth(year, month);
  const buddhist = year + 543;
  const monthShort = THAI_MONTHS_SHORT[month - 1];

  // คำนวณเครดิตรวมทั้งทีม (base — ก่อนหักวันลา)
  const activeMembers = TEAM_MEMBERS.filter((m) => !m.excludeFromCredits);
  const teamTotalCredits = activeMembers.reduce((sum, m) => {
    const hrs = m.isLead ? (m.customHoursPerMonth ?? info.workingHours) : info.workingHours;
    return sum + hoursToCredits(hrs);
  }, 0);

  // เครดิตรวมเดือนก่อนหน้า
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear  = month === 1 ? year - 1 : year;
  const prevInfo  = getWorkdayInfo(prevYear, prevMonth);
  const prevMonthCredits = activeMembers.reduce((sum, m) => {
    const hrs = m.isLead ? (m.customHoursPerMonth ?? prevInfo.workingHours) : prevInfo.workingHours;
    return sum + hoursToCredits(hrs);
  }, 0);
  const prevMonthLabel = `${THAI_MONTHS_SHORT[prevMonth - 1]} ${prevYear + 543}`;

  return (
    <AdminGate>
    <div style={{ background: "var(--bg-page)", minHeight: "calc(100vh - 56px)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

        {/* ── Page Header ── */}
        <div className="mb-6 sm:mb-8">
          {/* Top row: label + month selector */}
          <div className="flex items-start justify-between gap-4 mb-3 sm:mb-4">
            <p className="text-xs font-black uppercase tracking-[0.15em] pt-1"
              style={{ color: "var(--accent)" }}>Credit Report · ที่มาของเครดิต</p>
            <MonthSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
          </div>
          {/* Heading */}
          <h1 className="text-3xl sm:text-4xl font-black leading-none tracking-tight"
            style={{ color: "var(--text-primary)" }}>
            {THAI_MONTHS_SHORT[month - 1]}{" "}
            <span style={{ color: "var(--accent)" }}>{buddhist}</span>
          </h1>
          <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
            คำนวณชั่วโมงและ M Coin สำหรับสมาชิกทีม Multimedia
          </p>
        </div>

        {/* ── Stats Bar ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mb-6 sm:mb-8">
          <StatCard label="วันทั้งหมด" value={info.totalDays} unit="วัน"
            note={`${monthShort} ${buddhist}`} variant="default" />
          <StatCard
            label="วันหยุดรวม"
            value={info.weekendDays + info.holidayDays}
            unit="วัน"
            note={`เสาร์-อาทิตย์ ${info.weekendDays} + พิเศษ ${info.holidayDays}`}
            variant="muted"
          />
          <StatCard label="วันทำงานจริง" value={info.workingDays} unit="วัน"
            note={`${info.workingHours} ชั่วโมง`} variant="default" noteAccent />
          <StatCardHero
            label="เครดิตรวมทั้งทีม"
            value={teamTotalCredits}
            note={`${activeMembers.length} คน · ก่อนหักวันลา`}
          />
        </div>

        {/* ── Main Layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 sm:gap-6 items-start">

          {/* Table */}
          <CreditOriginTable key={`${year}-${month}`} workdayInfo={info} year={year} month={month}
            prevMonthCredits={prevMonthCredits} prevMonthLabel={prevMonthLabel} />

          {/* Sidebar */}
          <aside className="space-y-4">

            {/* Holidays card */}
            <div className="rounded-2xl border overflow-hidden shadow-sm"
              style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
              <div className="px-5 py-4 border-b flex items-center gap-3"
                style={{ borderColor: "var(--border)", background: "#FAFAFA" }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-base shrink-0"
                  style={{ background: "var(--accent-light)" }}>🏖️</div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest" style={{ color: "var(--text-primary)" }}>
                    วันหยุด {monthShort}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {holidays.length} วัน
                  </p>
                </div>
              </div>

              <div className="p-5">
                {holidays.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-2xl mb-1">🎉</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>ไม่มีวันหยุดพิเศษ</p>
                  </div>
                ) : (
                  <ul className="space-y-3.5">
                    {holidays.map((h, i) => (
                      <li key={h.date} className="flex gap-3">
                        <div className="w-5 h-5 rounded flex items-center justify-center text-xs font-black shrink-0 mt-0.5"
                          style={{ background: "var(--bg-dark)", color: "#fff" }}>
                          {i + 1}
                        </div>
                        <div>
                          <p className="text-xs font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
                            {h.name}
                          </p>
                          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                            {formatThaiDate(h.date)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Formula card */}
            <div className="rounded-2xl overflow-hidden border shadow-sm"
              style={{ background: "var(--bg-dark)", borderColor: "var(--bg-dark)" }}>
              <div className="px-5 pt-5 pb-4 border-b" style={{ borderColor: "var(--border-dark)" }}>
                <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: "var(--accent)" }}>
                  วิธีคำนวณ
                </p>
                <p className="text-white font-bold text-sm mt-0.5">สูตรการคิดเครดิต</p>
              </div>

              <div className="p-5 space-y-4">
                <FormulaRow
                  step="01" label="วันทำงาน"
                  formula={`${info.totalDays} − ${info.weekendDays} − ${info.holidayDays}`}
                  result={`= ${info.workingDays} วัน`}
                />
                <FormulaRow
                  step="02" label="ชั่วโมงทำงาน"
                  formula={`${info.workingDays} × 8 h`}
                  result={`= ${info.workingHours} h`}
                />
                <div className="rounded-xl p-4 mt-2" style={{ background: "var(--accent)" }}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/70 mb-1">กฎหลัก</p>
                  <p className="text-white font-black text-base leading-tight">
                    1 Credit = 2 ชั่วโมง
                  </p>
                  <p className="text-white/80 text-xs mt-1 font-medium">
                    M Coin = ชั่วโมงสุทธิ ÷ 2
                  </p>
                </div>
              </div>
            </div>

          </aside>
        </div>
      </div>
    </div>
    </AdminGate>
  );
}

/* ── Sub-components ── */

function StatCard({ label, value, unit, note, variant, noteAccent }: {
  label: string; value: number; unit: string; note: string;
  variant: "default" | "muted" | "accent" | "dark";
  noteAccent?: boolean;
}) {
  const styles = {
    default: { bg: "var(--bg-card)", border: "var(--border)", label: "var(--text-muted)", value: "var(--text-primary)", note: "var(--text-muted)" },
    muted:   { bg: "#FAFAFA",       border: "var(--border)", label: "var(--text-muted)", value: "var(--text-secondary)", note: "var(--text-muted)" },
    accent:  { bg: "var(--accent-light)", border: "transparent", label: "var(--accent)", value: "var(--accent)", note: "var(--accent)" },
    dark:    { bg: "var(--bg-dark)", border: "transparent", label: "#888", value: "#fff", note: "var(--accent)" },
  }[variant];

  return (
    <div className="rounded-xl sm:rounded-2xl border p-3.5 sm:p-5 shadow-sm"
      style={{ background: styles.bg, borderColor: styles.border }}>
      <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest mb-2 sm:mb-3" style={{ color: styles.label }}>{label}</p>
      <div className="flex items-end gap-1 mb-0.5 sm:mb-1">
        <p className="text-2xl sm:text-3xl font-black leading-none" style={{ color: styles.value }}>{value}</p>
        <p className="text-xs sm:text-sm font-semibold mb-0.5" style={{ color: styles.label }}>{unit}</p>
      </div>
      <p className="text-[11px] sm:text-xs font-medium" style={{ color: noteAccent ? "var(--accent)" : styles.note }}>{note}</p>
    </div>
  );
}

function StatCardHero({ label, value, note }: {
  label: string; value: number; note: string;
}) {
  return (
    <div className="rounded-xl sm:rounded-2xl p-3.5 sm:p-5 shadow-sm relative overflow-hidden"
      style={{ background: "var(--accent)", border: "none" }}>
      {/* Decorative circle */}
      <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full opacity-20"
        style={{ background: "#fff" }} />
      <div className="absolute -right-2 -bottom-6 w-28 h-28 rounded-full opacity-10"
        style={{ background: "#fff" }} />

      <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest mb-2 sm:mb-3 relative"
        style={{ color: "rgba(255,255,255,0.75)" }}>
        {label}
      </p>
      <div className="flex items-end gap-1.5 mb-0.5 sm:mb-1 relative">
        <p className="text-3xl sm:text-4xl font-black leading-none text-white">{value}</p>
        <p className="text-sm sm:text-base font-bold mb-0.5 whitespace-nowrap" style={{ color: "rgba(255,255,255,0.8)" }}>
          M Coin
        </p>
      </div>
      <p className="text-[11px] sm:text-xs font-medium relative" style={{ color: "rgba(255,255,255,0.65)" }}>
        {note}
      </p>
    </div>
  );
}

function FormulaRow({ step, label, formula, result }: {
  step: string; label: string; formula: string; result: string;
}) {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5"
        style={{ background: "var(--border-dark)", color: "#666" }}>
        {step}
      </div>
      <div className="flex-1">
        <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "#555" }}>{label}</p>
        <p className="font-mono text-xs text-white/70">{formula}</p>
        <p className="font-black text-sm text-white mt-0.5">{result}</p>
      </div>
    </div>
  );
}
