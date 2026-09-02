import type { PublicCalendarEvent } from "../api/calendar";

export function localDateKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function localDatePlusDays(days: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}

function eventEndDateKey(e: PublicCalendarEvent): string {
  if (e.recurrence && e.isAllDay) return e.date;
  return e.endDate && e.endDate > e.date ? e.endDate : e.date;
}

/** Matches server calendar storage: clock times are UTC on the YYYY-MM-DD key. */
export function eventEndInstantMs(e: PublicCalendarEvent): number {
  const endKey = eventEndDateKey(e);
  const [y, m, d] = endKey.split("-").map(Number);

  if (e.isAllDay || (!e.time && !e.endTime)) {
    return Date.UTC(y!, m! - 1, d!, 23, 59, 59, 999);
  }

  const clock = e.endTime ?? e.time;
  if (clock && /^\d{2}:\d{2}$/.test(clock)) {
    const [hh, mm] = clock.split(":").map(Number);
    return Date.UTC(y!, m! - 1, d!, hh!, mm!, 0, 0);
  }

  return Date.UTC(y!, m! - 1, d!, 23, 59, 59, 999);
}

/** True while the event has not fully ended yet (inclusive of ongoing multi-day / today). */
export function isUpcomingCalendarEvent(e: PublicCalendarEvent, now = new Date()): boolean {
  const today = localDateKey(now);
  const endKey = eventEndDateKey(e);

  if (e.isAllDay || (!e.time && !e.endTime)) {
    return endKey >= today;
  }

  return eventEndInstantMs(e) > now.getTime();
}

const DASHBOARD_EVENT_CATEGORIES = new Set([
  "personal",
  "family",
  "document_expiry",
  "recurring_deposit",
  "company",
]);

export function compareUpcomingEvents(a: PublicCalendarEvent, b: PublicCalendarEvent): number {
  const byDate = a.date.localeCompare(b.date);
  if (byDate !== 0) return byDate;
  const byTime = (a.time ?? "").localeCompare(b.time ?? "");
  if (byTime !== 0) return byTime;
  return a.id.localeCompare(b.id);
}

/** Keep the soonest upcoming item per series (recurring rules). */
export function uniqueUpcomingBySeries(events: PublicCalendarEvent[], limit: number): PublicCalendarEvent[] {
  const seen = new Set<string>();
  const out: PublicCalendarEvent[] = [];
  for (const e of events) {
    const key = e.seriesId || e.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

export function pickDashboardUpcomingEvents(
  items: PublicCalendarEvent[],
  opts?: { now?: Date; limit?: number },
): PublicCalendarEvent[] {
  const now = opts?.now ?? new Date();
  const limit = opts?.limit ?? 3;
  const filtered = items
    .filter((e) => DASHBOARD_EVENT_CATEGORIES.has(e.category))
    .filter((e) => isUpcomingCalendarEvent(e, now))
    .sort(compareUpcomingEvents);
  return uniqueUpcomingBySeries(filtered, limit);
}
