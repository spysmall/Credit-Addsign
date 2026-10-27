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
  className?: string;
}

export default function MonthSelector({ year, month, onChange, className = "" }: Props) {
  const buddhist = year + 543;
  const prev = () => month === 1 ? onChange(year - 1, 12) : onChange(year, month - 1);
  const next = () => month === 12 ? onChange(year + 1, 1) : onChange(year, month + 1);

  const arrow = "w-9 h-9 rounded-md flex items-center justify-center transition-colors hover:bg-black/5";
  const chevron = (d: string) => (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
  );

  return (
    <div className={`inline-flex items-center justify-between h-10 rounded-lg border p-0.5 ${className}`}
      role="group" aria-label="เลือกเดือน"
      style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text-secondary)" }}>
      <button type="button" onClick={prev} aria-label="เดือนก่อนหน้า" className={arrow}>{chevron("M12.5 4.5 7 10l5.5 5.5")}</button>
      <p className="num px-3 flex-1 sm:flex-none sm:min-w-[8.5rem] text-center text-sm font-semibold leading-none whitespace-nowrap" aria-live="polite" style={{ color: "var(--text-primary)" }}>
        <span className="sm:hidden">{THAI_MONTHS_SHORT[month - 1]}</span>
        <span className="hidden sm:inline">{THAI_MONTHS[month - 1]}</span>{" "}{buddhist}
      </p>
      <button type="button" onClick={next} aria-label="เดือนถัดไป" className={arrow}>{chevron("M7.5 4.5 13 10l-5.5 5.5")}</button>
    </div>
  );
}
