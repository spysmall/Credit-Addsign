"use client";

const THAI_MONTHS = [
  "มกราคม","กุมภาพันธ์","มีนาคม","เมษายน",
  "พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม",
  "กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม",
];
const THAI_MONTHS_SHORT = [
  "ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.",
  "ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค.",
];

interface Props {
  year: number;
  month: number;
  onChange: (year: number, month: number) => void;
}

export default function MonthSelector({ year, month, onChange }: Props) {
  const buddhist = year + 543;
  const prev = () => month === 1 ? onChange(year - 1, 12) : onChange(year, month - 1);
  const next = () => month === 12 ? onChange(year + 1, 1) : onChange(year, month + 1);

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
      <button onClick={prev} aria-label="เดือนก่อนหน้า"
        className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg border flex items-center justify-center font-semibold transition-all hover:border-orange-400 hover:text-orange-500"
        style={{ borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--bg-card)", fontSize: 16 }}>
        ‹
      </button>

      <div className="text-center px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl border"
        style={{ borderColor: "var(--border)", background: "var(--bg-card)", minWidth: 120 }}>
        {/* Mobile: short month name */}
        <p className="font-bold text-xs sm:hidden" style={{ color: "var(--text-primary)" }}>
          {THAI_MONTHS_SHORT[month - 1]} <span style={{ color: "var(--accent)" }}>{buddhist}</span>
        </p>
        {/* Desktop: full month name */}
        <p className="font-bold text-sm hidden sm:block" style={{ color: "var(--text-primary)" }}>
          {THAI_MONTHS[month - 1]}{" "}<span style={{ color: "var(--accent)" }}>{buddhist}</span>
        </p>
        <p className="text-[10px] mt-0.5 hidden sm:block" style={{ color: "var(--text-muted)" }}>
          {String(month).padStart(2, "0")} / {year}
        </p>
      </div>

      <button onClick={next} aria-label="เดือนถัดไป"
        className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg border flex items-center justify-center font-semibold transition-all hover:border-orange-400 hover:text-orange-500"
        style={{ borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--bg-card)", fontSize: 16 }}>
        ›
      </button>
    </div>
  );
}
