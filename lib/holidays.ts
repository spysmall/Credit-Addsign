export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
  nameEn: string;
}

// วันหยุดสถาบันการเงิน อ้างอิงจาก ธนาคารแห่งประเทศไทย
// https://www.bot.or.th/th/financial-institutions-holiday.html
// ประกาศ ธปท. ที่ 31/2568 (วันหยุดประเพณี) + ที่ 26/2569 (วันหยุดพิเศษ)

const HOLIDAYS: Record<string, Holiday[]> = {
  // ─── 2569 (2026) ───────────────────────────────────────────────
  "2026-01": [
    { date: "2026-01-01", name: "วันขึ้นปีใหม่", nameEn: "New Year's Day" },
    { date: "2026-01-02", name: "วันหยุดพิเศษ (กรณีพิเศษทั่วประเทศ)", nameEn: "Special Holiday" },
  ],
  "2026-02": [],
  "2026-03": [
    { date: "2026-03-03", name: "วันมาฆบูชา", nameEn: "Makha Bucha Day" },
  ],
  "2026-04": [
    { date: "2026-04-06", name: "วันจักรี", nameEn: "Chakri Memorial Day" },
    { date: "2026-04-13", name: "วันสงกรานต์", nameEn: "Songkran Festival" },
    { date: "2026-04-14", name: "วันสงกรานต์", nameEn: "Songkran Festival" },
    { date: "2026-04-15", name: "วันสงกรานต์", nameEn: "Songkran Festival" },
  ],
  "2026-05": [
    { date: "2026-05-01", name: "วันแรงงานแห่งชาติ", nameEn: "National Labour Day" },
    { date: "2026-05-04", name: "วันฉัตรมงคล", nameEn: "Coronation Day" },
  ],
  "2026-06": [
    { date: "2026-06-01", name: "ชดเชยวันวิสาขบูชา", nameEn: "Visakha Bucha Day (observed)" },
    { date: "2026-06-03", name: "วันเฉลิมพระชนมพรรษา พระบรมราชินี", nameEn: "HM Queen Suthida's Birthday" },
  ],
  "2026-07": [
    { date: "2026-07-28", name: "วันเฉลิมพระชนมพรรษา ร.10", nameEn: "HM King Rama X's Birthday" },
    { date: "2026-07-29", name: "วันอาสาฬหบูชา", nameEn: "Asanha Bucha Day" },
  ],
  "2026-08": [
    { date: "2026-08-12", name: "วันแม่แห่งชาติ / วันเฉลิมพระชนมพรรษา พระบรมราชินีนาถ", nameEn: "HM Queen Sirikit's Birthday / Mother's Day" },
  ],
  "2026-09": [],
  "2026-10": [
    { date: "2026-10-13", name: "วันนวมินทรมหาราช", nameEn: "HM King Bhumibol Memorial Day" },
    // 16 ต.ค. เป็นวันหยุดพิเศษเฉพาะพื้นที่กรุงเทพมหานคร ไม่นับรวมในการคำนวณ
    { date: "2026-10-23", name: "วันปิยมหาราช", nameEn: "Chulalongkorn Day" },
  ],
  "2026-11": [],
  "2026-12": [
    // 5 ธ.ค. ตกวันเสาร์ จึงชดเชยวันจันทร์ที่ 7 ธ.ค.
    { date: "2026-12-07", name: "ชดเชยวันพ่อแห่งชาติ / วันชาติ", nameEn: "National Day / Father's Day (observed)" },
    { date: "2026-12-10", name: "วันรัฐธรรมนูญ", nameEn: "Constitution Day" },
    { date: "2026-12-31", name: "วันสิ้นปี", nameEn: "New Year's Eve" },
  ],
};

export function getHolidaysForMonth(year: number, month: number): Holiday[] {
  const key = `${year}-${String(month).padStart(2, "0")}`;
  return HOLIDAYS[key] ?? [];
}
