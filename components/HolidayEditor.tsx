"use client";

import { useState } from "react";

interface Props {
  memberId: string;
  memberName: string;
  currentTimeOffHours: number;
  maxHours: number;
  onUpdate: (memberId: string, hours: number) => void;
}

export default function HolidayEditor({ memberName, currentTimeOffHours }: Props) {
  const [open, setOpen] = useState(false);

  const days = currentTimeOffHours / 8;
  const creditDeducted = currentTimeOffHours / 2;

  if (currentTimeOffHours === 0) {
    return (
      <div className="flex justify-center">
        <span className="text-lg leading-none" style={{ color: "var(--border)" }}>—</span>
      </div>
    );
  }

  return (
    <div className="relative flex justify-center">
      <button
        onClick={() => setOpen(true)}
        className="min-w-[52px] px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
        style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
        {currentTimeOffHours}<span className="text-xs font-normal ml-0.5">h</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-10 left-1/2 -translate-x-1/2 w-64 rounded-2xl shadow-2xl border overflow-hidden"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>

            <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
              <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{memberName}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>ข้อมูลวันหยุด / ลา</p>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>จำนวนวัน</span>
                <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{days} วัน</span>
              </div>

              <div className="rounded-xl p-3 flex justify-between items-center"
                style={{ background: "var(--accent-light)" }}>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>ชั่วโมงที่หัก</p>
                  <p className="font-black text-lg leading-tight" style={{ color: "var(--accent)" }}>{currentTimeOffHours} h</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>เครดิตที่หัก</p>
                  <p className="font-black text-lg leading-tight" style={{ color: "var(--accent)" }}>{creditDeducted}</p>
                </div>
              </div>
            </div>

            <div className="px-5 pb-4">
              <button onClick={() => setOpen(false)}
                className="w-full py-2.5 rounded-xl border text-sm font-semibold transition-all hover:bg-gray-50"
                style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                ปิด
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
