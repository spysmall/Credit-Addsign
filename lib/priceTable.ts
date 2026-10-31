/**
 * Credit price table, read-only from the "ตารางราคา" Google Sheet via the
 * public gviz CSV endpoint (same approach as lib/sheetTasks.ts).
 * The last successful fetch is cached in localStorage as an offline fallback.
 */

import { parseCSV } from "./csv";

const PRICE_SHEET_ID = "1kLSiFsWjUO51agYd3rtpRjviL1S4zO6YYl12tV5zgXE";
const PRICE_GID      = "338340518";
const CACHE_KEY      = "credit-price-table-v1";

export type RequestTypeKey =
  | "new" | "reuse" | "addImage" | "addVideo" | "fixDesign" | "fixBrief";

export const REQUEST_TYPES: { key: RequestTypeKey; label: string; hint: string; pct: string }[] = [
  { key: "new",       label: "ออกแบบใหม่",       hint: "ภาพ/วิดีโอ (ใหม่)",       pct: "100%" },
  { key: "reuse",     label: "ใช้ของเดิม",       hint: "ออกแบบโดยใช้ของเดิม",     pct: "50%"  },
  { key: "addImage",  label: "ขอเพิ่มภาพ",       hint: "ขนาด/ภาษา",               pct: "15%"  },
  { key: "addVideo",  label: "ขอเพิ่มวิดีโอ",    hint: "ขนาด/ภาษา",               pct: "50%"  },
  { key: "fixDesign", label: "ปรับแก้ (ดีไซน์)", hint: "แก้ตัวงานดีไซน์",         pct: "25%"  },
  { key: "fixBrief",  label: "ปรับแก้ (เปลี่ยนบรีฟ)", hint: "เปลี่ยนบรีฟใหม่",   pct: "100%" },
];

export interface PriceItem {
  code: string;      // M1, M2, ... A7
  category: string;  // group heading from the sheet
  name: string;
  unit: string;      // e.g. "General (1 img)"
  /** credit per piece for each request type; null = not available ("-") */
  credits: Record<RequestTypeKey, number | null>;
}

// Sheet columns (0-based): 0 category, 1 code, 2 name, 3 unit, 4 work time, 5..10 credits
const COL_ORDER: RequestTypeKey[] = ["new", "reuse", "addImage", "addVideo", "fixDesign", "fixBrief"];

function oneLine(s: string) {
  return s.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
}

function toCredit(raw: string | undefined): number | null {
  const v = (raw ?? "").trim();
  if (!v || v === "-") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export function parsePriceTable(csv: string): PriceItem[] {
  const items: PriceItem[] = [];
  let category = "";
  let lastName = "";
  for (const r of parseCSV(csv)) {
    const code = (r[1] ?? "").trim();
    if (!/^[MA]\d+$/.test(code)) continue;
    if (oneLine(r[0] ?? "")) category = oneLine(r[0]);
    // Rows like M17 / M23 / M30 leave the name blank → same task family as the row above
    const name = oneLine(r[2] ?? "") || lastName;
    lastName = name;
    const credits = {} as Record<RequestTypeKey, number | null>;
    COL_ORDER.forEach((k, i) => { credits[k] = toCredit(r[5 + i]); });
    if (credits.new === null) continue; // unusable row
    items.push({ code, category, name, unit: oneLine(r[3] ?? ""), credits });
  }
  return items;
}

/** Items temporarily not offered in the request form (all "A" drawing/character items). Remove a prefix to turn them back on. */
const HIDDEN_PREFIXES = ["A"];
const isOffered = (item: PriceItem) => !HIDDEN_PREFIXES.some((p) => item.code.startsWith(p));

export async function fetchPriceTable(): Promise<PriceItem[]> {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${PRICE_SHEET_ID}/gviz/tq?tqx=out:csv&gid=${PRICE_GID}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const items = parsePriceTable(await res.text());
    if (items.length === 0) throw new Error("empty");
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(items)); } catch { /* ignore */ }
    return items.filter(isOffered);
  } catch (err) {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) return (JSON.parse(cached) as PriceItem[]).filter(isOffered);
    } catch { /* ignore */ }
    throw err;
  }
}

export function unitCredit(item: PriceItem | undefined, type: RequestTypeKey): number | null {
  return item ? item.credits[type] : null;
}

/** credit = price per piece × qty, rounded to 2 decimals */
export function lineCredit(item: PriceItem | undefined, type: RequestTypeKey, qty: number): number {
  const unit = unitCredit(item, type);
  if (unit === null || !(qty > 0)) return 0;
  return Math.round(unit * qty * 100) / 100;
}

/** Map a price-table item to the Notion "ประเภทของงาน" option it belongs to. */
export function workTypeOf(code: string): string {
  const n = parseInt(code.slice(1), 10);
  if (code[0] === "A") return "Other";
  if ([3, 4, 7, 8, 9].includes(n)) return "Banner/Banner Ads";
  if ([1, 2].includes(n)) return "Logo";
  if ([5, 18, 19, 20].includes(n)) return "Icon";
  if ([14, 15].includes(n)) return "Photography/Retouch";
  if ([16, 17].includes(n)) return "Present";
  if (n === 28) return "Sound/Edit Sound";
  if (n === 21 || (n >= 22 && n <= 33)) return "Storyboard/VDO";
  if (n === 34) return "Merch";
  if (n === 35 || n === 36) return "Research";
  return "Other";
}

// Thai search keywords, matched against each item's English name/unit/category.
const THAI_KEYWORDS: [RegExp, string][] = [
  [/banner/i, "แบนเนอร์ บานเนอร์ ป้าย"],
  [/logo/i, "โลโก้ ตราสัญลักษณ์"],
  [/theme|\bci\b/i, "ธีม ซีไอ แบรนด์ อัตลักษณ์"],
  [/icon/i, "ไอคอน ไอค่อน"],
  [/shop/i, "ร้าน ร้านค้า ช็อป"],
  [/\bapp\b/i, "แอป แอพ แอปพลิเคชัน"],
  [/social profile/i, "โซเชียล โปรไฟล์ โปรไฟล์"],
  [/ads/i, "โฆษณา แอด"],
  [/\bkv\b|key visual/i, "เควี คีย์วิชวล หลัก"],
  [/album|\bset\b/i, "อัลบั้ม ชุด เซ็ต"],
  [/printing|name card|backdrop|stand|counter|rollup|uniform/i, "สิ่งพิมพ์ พิมพ์ นามบัตร การ์ด แบ็คดรอป สแตนดี้ เคาน์เตอร์ โรลอัพ ยูนิฟอร์ม"],
  [/infographic|catalog/i, "อินโฟกราฟิก อินโฟกราฟฟิก แคตตาล็อก แคตาล็อก"],
  [/photograph|retouch/i, "ถ่ายภาพ ภาพถ่าย ถ่ายรูป รีทัช แต่งภาพ โฟโต้"],
  [/presentation/i, "พรีเซนเทชัน พรีเซนต์ นำเสนอ สไลด์ พาวเวอร์พอยต์ ppt"],
  [/story ?board/i, "สตอรี่บอร์ด สตอรี่ บอร์ด"],
  [/vdo|video/i, "วิดีโอ วีดีโอ คลิป ตัดต่อ"],
  [/story/i, "สตอรี่ เรื่องราว"],
  [/motion/i, "โมชั่น โมชัน เคลื่อนไหว"],
  [/gif/i, "จีไอเอฟ กิฟ"],
  [/short|loop/i, "สั้น ลูป ช็อต"],
  [/highlight|tournament/i, "ไฮไลท์ ทัวร์นาเมนต์ แข่ง"],
  [/sound/i, "เสียง ซาวด์ ตัดต่อเสียง"],
  [/generate ai|gen ai|update ai/i, "เอไอ เจน เจนเนอเรท ai ปัญญาประดิษฐ์"],
  [/character/i, "ตัวละคร คาแรคเตอร์ แคแรคเตอร์"],
  [/costume/i, "เครื่องแต่งกาย คอสตูม ชุด"],
  [/background/i, "พื้นหลัง แบคกราวด์ ฉากหลัง"],
  [/merch/i, "เมิร์ช สินค้า เสื้อ ของที่ระลึก"],
  [/research|ref,/i, "รีเสิร์ช ค้นคว้า วิจัย อ้างอิง ref มู้ด โทน"],
  [/high details/i, "ละเอียด สูง ไฮดีเทล"],
  [/full day|outside|ยืมคน/i, "นอกสถานที่ ยืมคน เต็มวัน"],
  [/design/i, "ออกแบบ ดีไซน์"],
];

/** Thai words that should find this item when searching. */
export function thaiKeywords(item: PriceItem): string {
  const text = `${item.name} ${item.unit} ${item.category}`;
  return THAI_KEYWORDS.filter(([re]) => re.test(text)).map(([, w]) => w).join(" ");
}
