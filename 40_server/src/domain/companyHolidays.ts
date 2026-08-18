import type { HolidayName } from "./holidays.js";

export type CompanyHolidayCal = "NONE" | "KHI_AKASHI";

export interface CompanyHoliday {
  date: string;
  cal: CompanyHolidayCal;
  code: string;
  name: HolidayName;
}

const CALS = new Set<string>(["NONE", "KHI_AKASHI"]);

export function parseCompanyHolidayPref(value: unknown, fallback: CompanyHolidayCal = "NONE"): CompanyHolidayCal {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const v = value.trim().toUpperCase();
  return CALS.has(v) ? (v as CompanyHolidayCal) : fallback;
}

const N = {
  gw: { ko: "골든위크", ja: "GW休業" },
  power: { ko: "전력휴가", ja: "電力休暇" },
  summer: { ko: "하기휴가", ja: "夏季休暇" },
  yearEnd: { ko: "연말연시", ja: "年末年始" },
  company: { ko: "회사휴일", ja: "会社休日" },
} as const satisfies Record<string, HolidayName>;

type Extra = { date: string; code: string; name: HolidayName };

/**
 * 川崎重工 明石工場・西神工場(A) weekday closures that are not already a JP national holiday.
 * Source: FY2026 factory notice (Apr 2026–Mar 2027) used by 労組カレンダー / BK117.
 * Weekends are omitted — the app already treats Sat/Sun as non-work visually via the grid.
 */
const KHI_AKASHI_EXTRAS: Extra[] = [
  { date: "2026-04-30", code: "gw", name: N.gw },
  { date: "2026-05-01", code: "gw", name: N.gw },
  { date: "2026-07-21", code: "power", name: N.power },
  { date: "2026-07-22", code: "power", name: N.power },
  { date: "2026-08-10", code: "summer", name: N.summer },
  { date: "2026-08-12", code: "summer", name: N.summer },
  { date: "2026-08-13", code: "summer", name: N.summer },
  { date: "2026-08-14", code: "summer", name: N.summer },
  { date: "2026-12-28", code: "year-end", name: N.yearEnd },
  { date: "2026-12-29", code: "year-end", name: N.yearEnd },
  { date: "2026-12-30", code: "year-end", name: N.yearEnd },
  { date: "2026-12-31", code: "year-end", name: N.yearEnd },
];

export function listCompanyHolidays(
  fromKey: string,
  toKey: string,
  cal: CompanyHolidayCal,
): CompanyHoliday[] {
  if (cal === "NONE") return [];
  const rows = cal === "KHI_AKASHI" ? KHI_AKASHI_EXTRAS : [];
  return rows
    .filter((h) => h.date >= fromKey && h.date <= toKey)
    .map((h) => ({ date: h.date, cal, code: h.code, name: h.name }));
}

export function companyHolidayTitle(h: CompanyHoliday, lang: string): string {
  return lang === "ja" ? h.name.ja : h.name.ko;
}
