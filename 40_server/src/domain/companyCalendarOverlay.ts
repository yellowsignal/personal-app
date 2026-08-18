import { parseDateKey } from "./calendarTypes.js";
import type { HolidayName, PublicHoliday } from "./holidays.js";
import { companyOffTitle, type CompanyHolidayCal } from "./companyHolidays.js";

export type CompanyEventKind = "off" | "work";

export interface CompanyCalendarEvent {
  date: string;
  cal: CompanyHolidayCal;
  kind: CompanyEventKind;
  code: string;
  name: HolidayName;
}

export interface HolidayOverlay {
  national: PublicHoliday[];
  company: CompanyCalendarEvent[];
}

function dow(key: string): number {
  return parseDateKey(key).getUTCDay();
}

function isWeekday(key: string): boolean {
  const d = dow(key);
  return d !== 0 && d !== 6;
}

function inRange(date: string, fromKey: string, toKey: string): boolean {
  return date >= fromKey && date <= toKey;
}

/**
 * When a full company off-set is available it is the work/off source of truth:
 * - JP 祝日 on a weekday that is not a company off day → 出勤 (hide as 祝日)
 * - Weekday company off that is not a remaining national holiday → 会社休日
 * - JP 祝日 that is also a company off stays a national holiday (no duplicate)
 * KR holidays are never suppressed.
 * Weekends are omitted from company events (the grid already colors Sat/Sun).
 */
export function overlayCompanyCalendar(opts: {
  national: PublicHoliday[];
  offDates: ReadonlySet<string> | null;
  cal: CompanyHolidayCal;
  fromKey: string;
  toKey: string;
}): HolidayOverlay {
  if (opts.cal === "NONE" || !opts.offDates || opts.offDates.size === 0) {
    return { national: opts.national, company: [] };
  }

  const national: PublicHoliday[] = [];
  const company: CompanyCalendarEvent[] = [];
  const remainingNationalDates = new Set<string>();

  for (const h of opts.national) {
    if (!inRange(h.date, opts.fromKey, opts.toKey)) continue;
    const jpWorkday = h.country === "JP" && isWeekday(h.date) && !opts.offDates.has(h.date);
    if (jpWorkday) {
      company.push({
        date: h.date,
        cal: opts.cal,
        kind: "work",
        code: `work-${h.code}`,
        name: {
          ko: `출근 · ${h.name.ko}`,
          ja: `出勤 · ${h.name.ja}`,
        },
      });
      continue;
    }
    national.push(h);
    remainingNationalDates.add(h.date);
  }

  for (const date of opts.offDates) {
    if (!inRange(date, opts.fromKey, opts.toKey)) continue;
    if (!isWeekday(date)) continue;
    if (remainingNationalDates.has(date)) continue;
    const title = companyOffTitle(date);
    company.push({
      date,
      cal: opts.cal,
      kind: "off",
      code: title.code,
      name: title.name,
    });
  }

  company.sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code));
  return { national, company };
}
