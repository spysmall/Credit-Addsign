"use client";

import { useState } from "react";

interface Props {
  memberId: string;
  memberName: string;
  currentTimeOffHours: number;
  maxHours: number;
  onUpdate: (memberId: string, hours: number) => void;
}

export default function HolidayEditor({ memberId, memberName, currentTimeOffHours, maxHours, onUpdate }: Props) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(String(currentTimeOffHours / 8));

  const daysNum = parseFloat(days) || 0;
  const hoursResult = daysNum * 8;
  const invalid = hoursResult < 0 || hoursResult > maxHours;

  const apply = () => {
    if (invalid) return;
    onUpdate(memberId, hoursResult);
    setOpen(false);
  };

  return (
    <div className="relative flex justify-center">
      <button
        onClick={() => { setDays(String(currentTimeOffHours / 8)); setOpen(true); }}
        className="min-w-[52px] px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
        style={currentTimeOffHours > 0
          ? { background: "var(--accent-light)", color: "var(--accent)" }
          : { background: "transparent", color: "var(--text-muted)" }}>
        {currentTimeOffHours > 0
          ? <>{currentTimeOffHours}<span className="text-xs font-normal ml-0.5">h</span></>
          : <span className="text-lg leading-none" style={{ color: "var(--border)" }}>—</span>
        }
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-10 left-1/2 -translate-x-1/2 w-64 rounded-2xl shadow-2xl border overflow-hidden"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>

            {/* Header */}
            <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
              <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{memberName}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>ระบุจำนวนวันที่หยุด / ลา</p>
            </div>

            {/* Body */}
            <div className="px-5 py-4">
              <label className="text-xs font-semibold uppercase tracking-wider block mb-2"
                style={{ color: "var(--text-muted)" }}>จำนวนวัน</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="0" step="0.5" value={days}
                  onChange={(e) => setDays(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") apply(); if (e.key === "Escape") setOpen(false); }}
                  className="flex-1 rounded-lg border px-3 py-2.5 text-sm font-semibold text-center focus:outline-none transition-all"
                  style={{
                    borderColor: invalid && days !== "0" ? "#EF4444" : "var(--border)",
                    color: "var(--text-primary)",
                    background: "#FAFAFA",
                  }}
                  placeholder="0"
                />
                <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>วัน</span>
              </div>

              {daysNum > 0 && !invalid && (
                <div className="mt-3 rounded-xl p-3 flex justify-between items-center"
                  style={{ background: "var(--accent-light)" }}>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>ชั่วโมงที่หัก</p>
                    <p className="font-black text-lg leading-tight" style={{ color: "var(--accent)" }}>{hoursResult} h</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>เครดิตที่หัก</p>
                    <p className="font-black text-lg leading-tight" style={{ color: "var(--accent)" }}>{hoursResult / 2}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 pb-4 flex gap-2">
              <button onClick={() => setOpen(false)}
                className="flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all hover:bg-gray-50"
                style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                ยกเลิก
              </button>
              <button onClick={apply} disabled={invalid}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
                style={{ background: invalid ? "#D1D1D1" : "var(--accent)", cursor: invalid ? "not-allowed" : "pointer" }}>
                บันทึก
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
