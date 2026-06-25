"use client";

import { useState, useEffect } from "react";
import MonthSelector from "@/components/MonthSelector";
import { loadDistConfig, computeSummaryCredits, getSummaryGroups } from "@/lib/distribution";
import { getWorkdayInfo, hoursToCredits } from "@/lib/workdays";
import { TEAM_MEMBERS } from "@/lib/team";

const THAI_MONTHS_SHORT = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const THAI_MONTHS_FULL  = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

function prevYM(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function teamTotalCredits(y: number, m: number): number {
  const info = getWorkdayInfo(y, m);
  const active = TEAM_MEMBERS.filter((mem) => !mem.excludeFromCredits);
  return active.reduce((sum, mem) => {
    const hrs = mem.isLead ? (mem.customHoursPerMonth ?? info.workingHours) : info.workingHours;
    return sum + hoursToCredits(hrs);
  }, 0);
}

function pctChange(curr: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

export default function SummaryPage() {
  const [year, setYear]   = useState(2026);
  const [month, setMonth] = useState(7);

  const { year: py, month: pm } = prevYM(year, month);
  const buddhist     = year + 543;
  const prevBuddhist = py + 543;

  // Current month allocation
  const [currAlloc, setCurrAlloc]   = useState<Record<string, number>>({});
  const [groups, setGroups]         = useState<string[]>([]);

  // Previous month allocation
  const [prevAlloc, setPrevAlloc]   = useState<Record<string, number>>({});

  useEffect(() => {
    const currConfig  = loadDistConfig(year, month);
    const currTotal   = teamTotalCredits(year, month);
    const curr        = computeSummaryCredits(currConfig, currTotal);
    setCurrAlloc(curr);
    setGroups(getSummaryGroups(currConfig));

    const prevConfig  = loadDistConfig(py, pm);
    const prevTotal   = teamTotalCredits(py, pm);
    const prev        = computeSummaryCredits(prevConfig, prevTotal);
    setPrevAlloc(prev);
  }, [year, month]);

  const currTotal = Object.values(currAlloc).reduce((s, v) => s + v, 0);
  const prevTotal = Object.values(prevAlloc).reduce((s, v) => s + v, 0);

  return (
    <div style={{ background: "var(--bg-page)", minHeight: "calc(100vh - 56px)" }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

        {/* ── Header ── */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-start justify-between gap-4 mb-3 sm:mb-4">
            <p className="text-xs font-black uppercase tracking-[0.15em] pt-1"
              style={{ color: "var(--accent)" }}>Summary · สรุปเครดิตทีม</p>
            <MonthSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black leading-none tracking-tight"
            style={{ color: "var(--text-primary)" }}>
            {THAI_MONTHS_FULL[month - 1]}{" "}
            <span style={{ color: "var(--accent)" }}>{buddhist}</span>
          </h1>
          <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
            เปรียบเทียบเครดิตที่จัดสรรเดือนนี้กับเดือน{THAI_MONTHS_SHORT[pm - 1]} {prevBuddhist}
          </p>
        </div>

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <div className="rounded-2xl p-4 border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>เครดิตรวมเดือนก่อน</p>
            <p className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>
              {prevTotal > 0 ? prevTotal.toLocaleString() : "—"}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>M Coin · {THAI_MONTHS_SHORT[pm - 1]} {prevBuddhist}</p>
          </div>
          <div className="rounded-2xl p-4 border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>เครดิตรวมเดือนนี้</p>
            <p className="text-2xl font-black" style={{ color: "var(--accent)" }}>{currTotal.toLocaleString()}</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>M Coin · {THAI_MONTHS_SHORT[month - 1]} {buddhist}</p>
          </div>
          {prevTotal > 0 && (() => {
            const chg = pctChange(currTotal, prevTotal);
            const up  = chg !== null && chg >= 0;
            return (
              <div className="rounded-2xl p-4 border col-span-2 sm:col-span-1"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
                <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>เทียบกับเดือนก่อน</p>
                <p className="text-2xl font-black" style={{ color: up ? "#22C55E" : "#EF4444" }}>
                  {chg !== null ? `${up ? "+" : ""}${chg}%` : "—"}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{up ? "เพิ่มขึ้น" : "ลดลง"}จากเดือนก่อน</p>
              </div>
            );
          })()}
        </div>

        {/* ── Team Table ── */}
        <div className="rounded-2xl border overflow-hidden shadow-sm"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>

          <div className="grid px-5 py-3 border-b text-[10px] font-black uppercase tracking-widest"
            style={{
              borderColor: "var(--border)",
              background: "var(--bg-page)",
              gridTemplateColumns: "1fr 120px 120px 90px",
              color: "var(--text-muted)",
            }}>
            <span>ทีม</span>
            <span className="text-right">{THAI_MONTHS_SHORT[month - 1]} {buddhist}<br/>เครดิตใหม่</span>
            <span className="text-right">{THAI_MONTHS_SHORT[pm - 1]} {prevBuddhist}<br/>เครดิตก่อน</span>
            <span className="text-right">เปลี่ยนแปลง</span>
          </div>

          {groups.map((group, i) => {
            const curr = currAlloc[group] ?? 0;
            const prev = prevAlloc[group] ?? 0;
            const chg  = pctChange(curr, prev);
            const up   = chg !== null && chg >= 0;

            return (
              <div key={group}
                className="grid px-5 py-3 items-center"
                style={{
                  gridTemplateColumns: "1fr 120px 120px 90px",
                  borderBottom: i < groups.length - 1 ? "1px solid var(--border)" : "none",
                }}>
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{group}</span>
                <span className="text-right font-black text-sm" style={{ color: "var(--accent)" }}>
                  {curr > 0 ? curr.toLocaleString() : <span style={{ color: "var(--text-muted)" }}>—</span>}
                </span>
                <span className="text-right text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
                  {prev > 0 ? prev.toLocaleString() : <span style={{ color: "var(--text-muted)" }}>—</span>}
                </span>
                <span className="text-right text-xs font-bold">
                  {chg !== null && prev > 0
                    ? <span style={{ color: up ? "#22C55E" : "#EF4444" }}>{up ? "+" : ""}{chg}%</span>
                    : <span style={{ color: "var(--text-muted)" }}>—</span>}
                </span>
              </div>
            );
          })}

          {/* Total row */}
          <div className="grid px-5 py-3 border-t items-center"
            style={{
              gridTemplateColumns: "1fr 120px 120px 90px",
              borderColor: "var(--border)",
              background: "var(--bg-dark)",
            }}>
            <span className="text-xs font-black uppercase tracking-widest text-white">รวม</span>
            <span className="text-right font-black text-sm" style={{ color: "var(--accent)" }}>{currTotal.toLocaleString()}</span>
            <span className="text-right text-sm font-bold text-white">{prevTotal > 0 ? prevTotal.toLocaleString() : "—"}</span>
            <span className="text-right text-xs font-bold">
              {prevTotal > 0 && (() => {
                const chg = pctChange(currTotal, prevTotal);
                const up  = chg !== null && chg >= 0;
                return chg !== null
                  ? <span style={{ color: up ? "#22C55E" : "#EF4444" }}>{up ? "+" : ""}{chg}%</span>
                  : <span className="text-white">—</span>;
              })()}
            </span>
          </div>
        </div>

        <p className="text-[10px] mt-4 text-center" style={{ color: "var(--text-muted)" }}>
          เครดิตใหม่ / เครดิตก่อน = เครดิตที่จัดสรรตาม % ใน Credit Distribution แต่ละเดือน
        </p>

      </div>
    </div>
  );
}
