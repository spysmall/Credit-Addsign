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
  const [input, setInput] = useState("");

  const days = currentTimeOffHours / 8;
  const creditDeducted = currentTimeOffHours / 2;

  function openPopup() {
    setInput(currentTimeOffHours === 0 ? "" : String(currentTimeOffHours));
    setOpen(true);
  }

  function save() {
    const h = Math.max(0, Math.min(Number(input) || 0, maxHours));
    onUpdate(memberId, h);
    setOpen(false);
  }

  function clear() {
    onUpdate(memberId, 0);
    setOpen(false);
  }

  const trigger = currentTimeOffHours === 0 ? (
    <button onClick={openPopup} className="flex justify-center w-full group">
      <span className="text-lg leading-none transition-colors group-hover:opacity-50"
        style={{ color: "var(--text-muted)" }}>—</span>
    </button>
  ) : (
    <button
      onClick={openPopup}
      className="min-w-[52px] px-3 py-1.5 rounded-lg text-sm font-semibold transition-all hover:opacity-80"
      style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
      {currentTimeOffHours}<span className="text-xs font-normal ml-0.5">h</span>
    </button>
  );

  return (
    <div className="relative flex justify-center">
      {trigger}

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-10 left-1/2 -translate-x-1/2 w-64 rounded-2xl shadow-2xl border overflow-hidden"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>

            <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
              <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{memberName}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>ข้อมูลวันหยุด / ลา · ค่าที่แก้ใช้จำลองเท่านั้น</p>
            </div>

            <div className="px-5 py-4 space-y-3">
              {/* Input */}
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1.5"
                  style={{ color: "var(--text-muted)" }}>จำนวนชั่วโมงหยุด / ลา</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max={maxHours}
                    step="1"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setOpen(false); }}
                    autoFocus
                    placeholder="0"
                    className="flex-1 border rounded-lg px-3 py-2 text-sm font-bold text-center focus:outline-none"
                    style={{ borderColor: "var(--accent)", color: "var(--text-primary)", background: "var(--bg-page)" }}
                  />
                  <span className="text-sm font-semibold shrink-0" style={{ color: "var(--text-muted)" }}>h</span>
                </div>
              </div>

              {/* Preview */}
              {(Number(input) || 0) > 0 && (
                <div className="rounded-xl p-3 flex justify-between items-center"
                  style={{ background: "var(--accent-light)" }}>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>จำนวนวัน</p>
                    <p className="font-black text-lg leading-tight" style={{ color: "var(--accent)" }}>
                      {(Number(input) || 0) / 8} วัน
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>เครดิตที่หัก</p>
                    <p className="font-black text-lg leading-tight" style={{ color: "var(--accent)" }}>
                      {(Number(input) || 0) / 2}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 pb-4 flex gap-2">
              {currentTimeOffHours > 0 && (
                <button onClick={clear}
                  className="flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all hover:bg-gray-50"
                  style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                  ล้าง
                </button>
              )}
              <button onClick={save}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ background: "var(--accent)", color: "#fff" }}>
                บันทึก
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
