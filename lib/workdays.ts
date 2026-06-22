import { getHolidaysForMonth } from "./holidays";

export interface WorkdayInfo {
  totalDays: number;
  weekendDays: number;
  holidayDays: number;
  workingDays: number;
  workingHours: number;
}

export function getWorkdayInfo(year: number, month: number): WorkdayInfo {
  const daysInMonth = new Date(year, month, 0).getDate();
  const holidays = getHolidaysForMonth(year, month);
  const holidaySet = new Set(holidays.map((h) => h.date));

  let weekendDays = 0;
  let holidayDays = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dow = date.getDay(); // 0=Sun, 6=Sat
    if (dow === 0 || dow === 6) {
      weekendDays++;
    } else {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (holidaySet.has(dateStr)) {
        holidayDays++;
      }
    }
  }

  const workingDays = daysInMonth - weekendDays - holidayDays;
  return {
    totalDays: daysInMonth,
    weekendDays,
    holidayDays,
    workingDays,
    workingHours: workingDays * 8,
  };
}

export const HOURS_PER_CREDIT = 2;

export function hoursToCredits(hours: number): number {
  return hours / HOURS_PER_CREDIT;
}
