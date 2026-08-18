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

/** Kawasaki factory calendar is Apr 1 – Mar 31. */
export function fiscalYearRange(year: number): { from: string; to: string } {
  return { from: `${year}-04-01`, to: `${year + 1}-03-31` };
}

export function fiscalYearOfDate(date: string): number {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return y || 0;
  return m >= 4 ? y : y - 1;
}

export function clipOffDatesToFiscalYear(dates: readonly string[], year: number): string[] {
  const { from, to } = fiscalYearRange(year);
  return dates.filter((d) => d >= from && d <= to);
}

/** Off dates apply only to the registered (or baked) fiscal year overlapping `rangeFrom`. */
export function offDatesForFiscalYear(opts: {
  pref: CompanyHolidayCal;
  storedYear: number | null;
  storedDates: readonly string[] | null;
  rangeFrom: string;
}): ReadonlySet<string> | null {
  if (opts.pref === "NONE") return null;
  const rangeFy = fiscalYearOfDate(opts.rangeFrom);
  if (opts.storedYear != null && opts.storedDates && opts.storedDates.length > 0) {
    if (opts.storedYear !== rangeFy) return null;
    const clipped = clipOffDatesToFiscalYear(opts.storedDates, rangeFy);
    return clipped.length > 0 ? new Set(clipped) : null;
  }
  const baked = bakedOffDatesForCal(opts.pref);
  if (!baked) return null;
  const clipped = clipOffDatesToFiscalYear([...baked], rangeFy);
  return clipped.length > 0 ? new Set(clipped) : null;
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
