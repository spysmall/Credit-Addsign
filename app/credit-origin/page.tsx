"use client";

import { useState, useEffect } from "react";
import MonthSelector from "@/components/MonthSelector";
import CreditOriginTable from "@/components/CreditOriginTable";
import { getWorkdayInfo, hoursToCredits } from "@/lib/workdays";
import { getHolidaysForMonth } from "@/lib/holidays";
import { TEAM_MEMBERS } from "@/lib/team";
import { fetchLeaveHours } from "@/lib/sheetLeave";
import AdminGate from "@/components/AdminGate";

const THAI_MONTHS_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const DAYS_TH = ["อา.","จ.","อ.","พ.","พฤ.","ศ.","ส."];

function formatThaiDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return `${DAYS_TH[dow]}ที่ ${d} ${THAI_MONTHS_SHORT[m - 1]} ${y + 543}`;
}

export default function CreditOriginPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const info = getWorkdayInfo(year, month);
  const holidays = getHolidaysForMonth(year, month);
  const buddhist = year + 543;
  const monthShort = THAI_MONTHS_SHORT[month - 1];

  const activeMembers = TEAM_MEMBERS.filter((m) => !m.excludeFromCredits);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear  = month === 1 ? year - 1 : year;
  const prevInfo  = getWorkdayInfo(prevYear, prevMonth);
  const prevMonthLabel = `${THAI_MONTHS_SHORT[prevMonth - 1]} ${prevYear + 543}`;

  // this month's total after leave — reported by the table, which owns the leave data
  const [total, setTotal] = useState<{ credits: number; simulated: boolean } | null>(null);

  // เครดิตรวมเดือนก่อนหน้า — หักวันลา
  const [prevLeaveData, setPrevLeaveData] = useState<Record<string, number>>({});
  useEffect(() => {
    setPrevLeaveData({});
    fetchLeaveHours(prevYear, prevMonth).then(setPrevLeaveData).catch(() => {});
  }, [prevYear, prevMonth]);

  const prevMonthCredits = activeMembers.reduce((sum, m) => {
    const base = m.isLead ? (m.customHoursPerMonth ?? prevInfo.workingHours) : prevInfo.workingHours;
    const hrs = Math.max(0, base - (prevLeaveData[m.id] ?? 0));
    return sum + hoursToCredits(hrs);
  }, 0);

  const delta = total ? Math.round((total.credits - prevMonthCredits) * 100) / 100 : 0;
  const dim = { color: "rgba(255,255,255,0.7)" };

  return (
    <AdminGate>
    <div style={{ background: "var(--bg-page)", minHeight: "calc(100vh - 56px)" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">

        {/* ── Header ── */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--text-secondary)" }}>Information · ที่มาของเครดิต</p>
            <h1 className="text-3xl sm:text-4xl font-bold leading-tight tracking-tight" style={{ color: "var(--text-primary)" }}>
              {monthShort}{" "}<span className="num" style={{ color: "var(--accent-strong)" }}>{buddhist}</span>
            </h1>
          </div>
          <MonthSelector className="w-full sm:w-auto" year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
        </div>

        {/* ── Hero: team total after leave ── */}
        <div className="surface-dark p-5 sm:p-6 mb-4">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={dim}>
                เครดิตรวมทั้งทีม · {activeMembers.length} คน · หักวันลาแล้ว
              </p>
              <p className="flex items-baseline gap-2 mt-1">
                <span className="num text-5xl sm:text-6xl font-bold leading-none tracking-tight">{total ? total.credits.toLocaleString() : "…"}</span>
                <span className="text-sm font-medium" style={dim}>M Coin</span>
              </p>
              {total?.simulated && (
                <p className="mt-2 inline-block rounded-md px-2 py-0.5 text-xs font-semibold" style={{ background: "rgba(252,211,77,0.18)", color: "#FCD34D" }}>
                  ตัวเลขจำลอง · ยังไม่ได้บันทึก
                </p>
              )}
            </div>
            <dl className="flex gap-3">
              <div className="rounded-2xl px-4 py-2.5 min-w-[7rem]" style={{ background: "rgba(255,255,255,0.08)" }}>
                <dt className="text-xs" style={dim}>เดือนก่อน ({prevMonthLabel})</dt>
                <dd className="num text-xl font-semibold leading-tight">{prevMonthCredits.toLocaleString()}</dd>
              </div>
              {total && (
                <div className="rounded-2xl px-4 py-2.5 min-w-[6rem]" style={{ background: "rgba(232,81,30,0.22)" }}>
                  <dt className="text-xs" style={dim}>เปลี่ยนแปลง</dt>
                  <dd className="num text-xl font-semibold leading-tight" style={{ color: "#FFB599" }}>{delta > 0 ? "+" : ""}{delta.toLocaleString()}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* ── Calendar facts ── */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatCard label="วันทั้งหมด" value={info.totalDays} unit="วัน" note={`${monthShort} ${buddhist}`} />
          <StatCard label="วันหยุดรวม" value={info.weekendDays + info.holidayDays} unit="วัน"
            note={`ส.-อา. ${info.weekendDays} + พิเศษ ${info.holidayDays}`} />
          <StatCard label="วันทำงานจริง" value={info.workingDays} unit="วัน" note={`${info.workingHours} ชั่วโมง / คน`} accent />
        </div>

        {/* ── Main Layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">

          <CreditOriginTable key={`${year}-${month}`} workdayInfo={info} year={year} month={month}
            onTotalChange={(credits, simulated) => setTotal({ credits, simulated })} />

          <aside className="flex flex-col gap-4">

            {/* Holidays */}
            <section className="surface p-5" aria-label={`วันหยุด ${monthShort}`}>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>วันหยุดพิเศษ {monthShort}</h2>
                <span className="num text-xs rounded-full px-2 py-0.5" style={{ background: "var(--border)", color: "var(--text-secondary)" }}>{holidays.length} วัน</span>
              </div>
              {holidays.length === 0 ? (
                <p className="text-sm py-2" style={{ color: "var(--text-secondary)" }}>เดือนนี้ไม่มีวันหยุดพิเศษ</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {holidays.map((h) => {
                    const d = Number(h.date.slice(8, 10));
                    return (
                      <li key={h.date} className="flex items-center gap-3">
                        <span className="num w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0 leading-none"
                          style={{ background: "var(--accent-light)", color: "var(--accent-strong)" }}>
                          <span className="text-base font-bold">{d}</span>
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>{h.name}</span>
                          <span className="block text-xs" style={{ color: "var(--text-secondary)" }}>{formatThaiDate(h.date)}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Formula */}
            <section className="surface-dark p-5" aria-label="สูตรการคิดเครดิต">
              <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={dim}>วิธีคำนวณ</p>
              <h2 className="text-base font-bold mt-0.5 mb-4">สูตรการคิดเครดิต</h2>
              <ol className="flex flex-col gap-3.5">
                <FormulaRow step="1" label="วันทำงาน" formula={`${info.totalDays} − ${info.weekendDays} − ${info.holidayDays}`} result={`${info.workingDays} วัน`} />
                <FormulaRow step="2" label="ชั่วโมงทำงานต่อคน" formula={`${info.workingDays} × 8 ชม.`} result={`${info.workingHours} ชม.`} />
                <FormulaRow step="3" label="ชั่วโมงสุทธิ" formula="ชั่วโมงทำงาน − ลา/หยุด" result="รายคน" />
              </ol>
              <div className="rounded-xl p-4 mt-4" style={{ background: "rgba(232,81,30,0.22)" }}>
                <p className="text-xs" style={dim}>กฎหลัก</p>
                <p className="text-lg font-bold leading-tight">1 M Coin = 2 ชั่วโมง</p>
                <p className="text-xs mt-1" style={{ color: "#FFB599" }}>M Coin = ชั่วโมงสุทธิ ÷ 2</p>
              </div>
            </section>

          </aside>
        </div>
      </div>
    </div>
    </AdminGate>
  );
}

/* ── Sub-components ── */

function StatCard({ label, value, unit, note, accent }: {
  label: string; value: number; unit: string; note: string; accent?: boolean;
}) {
  return (
    <div className="surface p-3.5 sm:p-4">
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</p>
      <p className="flex items-baseline gap-1 mt-1">
        <span className="num text-2xl sm:text-3xl font-bold leading-none" style={{ color: accent ? "var(--accent-strong)" : "var(--text-primary)" }}>{value}</span>
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{unit}</span>
      </p>
      <p className="text-xs mt-1.5 truncate" style={{ color: "var(--text-secondary)" }} title={note}>{note}</p>
    </div>
  );
}

function FormulaRow({ step, label, formula, result }: {
  step: string; label: string; formula: string; result: string;
}) {
  return (
    <li className="flex gap-3 items-start">
      <span className="num w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
        style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)" }}>{step}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>{label}</p>
        <p className="num text-sm flex flex-wrap justify-between gap-x-2">
          <span style={{ color: "rgba(255,255,255,0.75)" }}>{formula}</span>
          <span className="font-semibold">= {result}</span>
        </p>
      </div>
    </li>
  );
}
