import type { HolidayName } from "./holidays.js";
import { KHI_AKASHI_FY2026_OFF_DATES } from "./khiAkashiFy2026OffDates.js";

export type CompanyHolidayCal = "NONE" | "KHI_AKASHI";

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

type NamedRange = { from: string; to: string; code: string; name: HolidayName };

const KHI_AKASHI_NAMED_RANGES: NamedRange[] = [
  { from: "2026-04-29", to: "2026-05-06", code: "gw", name: N.gw },
  { from: "2026-07-21", to: "2026-07-22", code: "power", name: N.power },
  { from: "2026-08-10", to: "2026-08-16", code: "summer", name: N.summer },
  { from: "2026-12-28", to: "2027-01-04", code: "year-end", name: N.yearEnd },
];

export function companyOffTitle(date: string): { code: string; name: HolidayName } {
  for (const r of KHI_AKASHI_NAMED_RANGES) {
    if (date >= r.from && date <= r.to) return { code: r.code, name: r.name };
  }
  return { code: "company", name: N.company };
}

export function companyEventTitle(
  ev: { kind: "off" | "work"; name: HolidayName },
  lang: string,
): string {
  return lang === "ja" ? ev.name.ja : ev.name.ko;
}

export const KHI_AKASHI_DEFAULT_URL =
  "https://www.khiunion.or.jp/wp-content/themes/kawasakijukou/pdf/calendar/{year}/09_{year}-akashi-A.pdf";

export function japanFiscalYear(now: Date = new Date()): number {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return m >= 4 ? y : y - 1;
}

export function khiAkashiCalendarUrl(year: number): string {
  return KHI_AKASHI_DEFAULT_URL.replaceAll("{year}", String(year));
}

/** Replace 20xx year tokens so next year's PDF can reuse last year's URL. */
export function substituteCalendarYear(url: string, year: number): string {
  return url.replace(/20\d{2}/g, String(year));
}

export function bakedOffDatesForCal(cal: CompanyHolidayCal): ReadonlySet<string> | null {
  if (cal === "KHI_AKASHI") return new Set(KHI_AKASHI_FY2026_OFF_DATES);
  return null;
}

export function weekdayCount(dates: readonly string[]): number {
  let n = 0;
  for (const d of dates) {
    const day = new Date(`${d}T00:00:00.000Z`).getUTCDay();
    if (day !== 0 && day !== 6) n += 1;
  }
  return n;
}
