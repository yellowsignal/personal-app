import { isDateKey, parseDateKey, toDateKey } from "./calendarTypes.js";

export type RecurrenceFreq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type RecurrenceMonthMode = "BY_MONTHDAY" | "BY_NTH_WEEKDAY";

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  interval: number;
  byWeekday?: number[];
  monthMode?: RecurrenceMonthMode;
  /** One or more of 1–4 or -1 (last). Single number kept for older clients. */
  bySetPos?: number | number[];
  until?: string;
  count?: number;
}

const FREQS = new Set<RecurrenceFreq>(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]);

function utcDate(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(d: Date, days: number): Date {
  const next = utcDate(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
}

function lastDayOfMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function uniqueWeekdays(values: number[] | undefined): number[] {
  if (!values?.length) return [];
  return [...new Set(values.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b);
}

export function inferBySetPos(date: Date): number {
  const weekday = date.getUTCDay();
  const nth = Math.ceil(date.getUTCDate() / 7);
  const last = nthWeekdayInMonth(date.getUTCFullYear(), date.getUTCMonth(), weekday, -1);
  if (last && toDateKey(last) === toDateKey(date)) return -1;
  return Math.min(Math.max(nth, 1), 4);
}

export function nthWeekdayInMonth(
  year: number,
  month0: number,
  weekday: number,
  nth: number,
): Date | null {
  if (nth === -1) {
    const last = new Date(Date.UTC(year, month0 + 1, 0));
    const back = (last.getUTCDay() - weekday + 7) % 7;
    last.setUTCDate(last.getUTCDate() - back);
    return last;
  }
  if (nth < 1 || nth > 4) return null;
  const first = new Date(Date.UTC(year, month0, 1));
  const add = (weekday - first.getUTCDay() + 7) % 7;
  const day = 1 + add + (nth - 1) * 7;
  if (day > lastDayOfMonth(year, month0)) return null;
  return new Date(Date.UTC(year, month0, day));
}

export function normalizeBySetPosList(
  value: number | number[] | undefined,
  fallback: number,
): number[] {
  const raw = Array.isArray(value) ? value : value != null ? [value] : [fallback];
  const allowed = new Set([-1, 1, 2, 3, 4]);
  const out = [...new Set(raw.filter((n) => allowed.has(n)))];
  return out.length ? out.sort((a, b) => (a === -1 ? 1 : b === -1 ? -1 : a - b)) : [fallback];
}

function monthOccurrences(dtstart: Date, year: number, month0: number, rule: RecurrenceRule): Date[] {
  if (rule.monthMode === "BY_NTH_WEEKDAY") {
    const weekday = (rule.byWeekday && rule.byWeekday[0] != null ? rule.byWeekday[0] : dtstart.getUTCDay()) as number;
    const positions = normalizeBySetPosList(rule.bySetPos, inferBySetPos(dtstart));
    const dates: Date[] = [];
    for (const pos of positions) {
      const occ = nthWeekdayInMonth(year, month0, weekday, pos);
      if (occ) dates.push(occ);
    }
    dates.sort((a, b) => a.getTime() - b.getTime());
    return dates;
  }
  const day = Math.min(dtstart.getUTCDate(), lastDayOfMonth(year, month0));
  return [new Date(Date.UTC(year, month0, day))];
}

function yearOccurrence(dtstart: Date, year: number): Date | null {
  const month0 = dtstart.getUTCMonth();
  const day = dtstart.getUTCDate();
  if (month0 === 1 && day === 29 && lastDayOfMonth(year, 1) < 29) {
    return new Date(Date.UTC(year, 1, 28));
  }
  const clamped = Math.min(day, lastDayOfMonth(year, month0));
  return new Date(Date.UTC(year, month0, clamped));
}

export function parseRecurrence(raw: unknown): RecurrenceRule | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return parseRecurrence(JSON.parse(raw) as unknown);
    } catch {
      return null;
    }
  }
  if (typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  if (body.freq == null && body.interval == null && body.byWeekday == null) return null;
  const freq = typeof body.freq === "string" ? body.freq.toUpperCase() : "";
  if (!FREQS.has(freq as RecurrenceFreq)) return null;
  const interval = typeof body.interval === "number" ? body.interval : Number(body.interval ?? 1);
  if (!Number.isInteger(interval) || interval < 1 || interval > 99) return null;

  const rule: RecurrenceRule = { freq: freq as RecurrenceFreq, interval };
  const weekdays = uniqueWeekdays(
    Array.isArray(body.byWeekday) ? body.byWeekday.map((n) => Number(n)) : undefined,
  );
  if (weekdays.length) rule.byWeekday = weekdays;

  if (body.monthMode === "BY_MONTHDAY" || body.monthMode === "BY_NTH_WEEKDAY") {
    rule.monthMode = body.monthMode;
  }
  if (Array.isArray(body.bySetPos)) {
    const list = normalizeBySetPosList(
      body.bySetPos.map((n) => Number(n)),
      1,
    ).filter((n) => n === -1 || n === 1 || n === 2 || n === 3 || n === 4);
    if (list.length === 1) rule.bySetPos = list[0];
    else if (list.length > 1) rule.bySetPos = list;
  } else {
    const pos = typeof body.bySetPos === "number" ? body.bySetPos : Number(body.bySetPos);
    if (pos === -1 || pos === 1 || pos === 2 || pos === 3 || pos === 4) rule.bySetPos = pos;
  }

  if (isDateKey(body.until)) rule.until = body.until;
  const count = typeof body.count === "number" ? body.count : Number(body.count);
  if (Number.isInteger(count) && count >= 1 && count <= 999) rule.count = count;
  return rule;
}

export function normalizeRecurrence(raw: unknown, dtstart: Date): RecurrenceRule | null {
  const parsed = parseRecurrence(raw);
  if (!parsed) return null;
  if (parsed.freq === "WEEKLY" && !parsed.byWeekday?.length) {
    parsed.byWeekday = [dtstart.getUTCDay()];
  }
  if (parsed.freq === "MONTHLY") {
    parsed.monthMode = parsed.monthMode ?? "BY_MONTHDAY";
    if (parsed.monthMode === "BY_NTH_WEEKDAY") {
      parsed.byWeekday = parsed.byWeekday?.length ? [parsed.byWeekday[0]!] : [dtstart.getUTCDay()];
      const list = normalizeBySetPosList(parsed.bySetPos, inferBySetPos(dtstart));
      parsed.bySetPos = list.length === 1 ? list[0]! : list;
    }
  }
  return parsed;
}

function matchesWeekly(date: Date, dtstart: Date, rule: RecurrenceRule): boolean {
  const weekdays = rule.byWeekday?.length ? rule.byWeekday : [dtstart.getUTCDay()];
  if (!weekdays.includes(date.getUTCDay())) return false;
  const startWeek = addUtcDays(dtstart, -dtstart.getUTCDay());
  const dateWeek = addUtcDays(date, -date.getUTCDay());
  const weeks = Math.round((dateWeek.getTime() - startWeek.getTime()) / 86_400_000 / 7);
  return weeks >= 0 && weeks % rule.interval === 0;
}

function* iterateOccurrences(rule: RecurrenceRule, dtstart: Date, rangeTo: Date): Generator<Date> {
  const start = utcDate(dtstart);
  const until = rule.until ? parseDateKey(rule.until) : null;
  const end = until && until < rangeTo ? until : rangeTo;
  const maxCount = rule.count ?? 10_000;
  let emitted = 0;

  if (rule.freq === "DAILY") {
    let cursor = start;
    while (cursor <= end && emitted < maxCount) {
      yield cursor;
      emitted += 1;
      cursor = addUtcDays(cursor, rule.interval);
    }
    return;
  }

  if (rule.freq === "WEEKLY") {
    let cursor = start;
    while (cursor <= end && emitted < maxCount) {
      if (matchesWeekly(cursor, start, rule)) {
        yield cursor;
        emitted += 1;
      }
      cursor = addUtcDays(cursor, 1);
    }
    return;
  }

  if (rule.freq === "MONTHLY") {
    let y = start.getUTCFullYear();
    let m = start.getUTCMonth();
    while (emitted < maxCount) {
      const months = monthsBetween(start, new Date(Date.UTC(y, m, 1)));
      if (months > 0 && months % rule.interval !== 0) {
        m += 1;
        if (m > 11) {
          m = 0;
          y += 1;
        }
        if (y > end.getUTCFullYear() + 1) break;
        continue;
      }
      const occs = monthOccurrences(start, y, m, rule);
      for (const occ of occs) {
        if (occ >= start && occ <= end) {
          yield occ;
          emitted += 1;
          if (emitted >= maxCount) break;
        }
      }
      if (occs.some((occ) => occ > end)) break;
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
      if (y > end.getUTCFullYear() + 2) break;
    }
    return;
  }

  let y = start.getUTCFullYear();
  while (emitted < maxCount && y <= end.getUTCFullYear() + 1) {
    const years = y - start.getUTCFullYear();
    if (years >= 0 && years % rule.interval === 0) {
      const occ = yearOccurrence(start, y);
      if (occ && occ >= start && occ <= end) {
        yield occ;
        emitted += 1;
      }
      if (occ && occ > end) break;
    }
    y += 1;
  }
}

export function expandRecurrence(
  rule: RecurrenceRule,
  dtstart: Date,
  rangeFrom: Date,
  rangeTo: Date,
): Date[] {
  const from = utcDate(rangeFrom);
  const to = utcDate(rangeTo);
  const out: Date[] = [];
  for (const occ of iterateOccurrences(rule, dtstart, to)) {
    if (occ < from) continue;
    if (occ > to) break;
    out.push(occ);
  }
  return out;
}

export function shiftDateTime(source: Date, fromDay: Date, toDay: Date): Date {
  const days = Math.round((utcDate(toDay).getTime() - utcDate(fromDay).getTime()) / 86_400_000);
  const next = new Date(source.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * End time for one expanded occurrence.
 * All-day recurring instances always end on the occurrence day so a long
 * master range (e.g. start=1st Wed, end=3rd Wed) does not paint week-long bars.
 * Timed instances keep the master duration via shiftDateTime.
 */
export function occurrenceEndTime(
  masterEnd: Date,
  isAllDay: boolean,
  fromDay: Date,
  toDay: Date,
): Date {
  if (isAllDay) {
    const end = utcDate(toDay);
    end.setUTCHours(23, 59, 59, 999);
    return end;
  }
  return shiftDateTime(masterEnd, fromDay, toDay);
}

export function parseCalendarEventId(raw: string): number | null {
  const series = raw.split(":")[0] ?? "";
  const id = Number(series);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

export function occurrenceId(seriesId: number, dateKey: string): string {
  return `${seriesId}:${dateKey}`;
}
