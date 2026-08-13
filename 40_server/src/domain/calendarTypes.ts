export type CalendarCategory =
  | "personal"
  | "family"
  | "holiday"
  | "document_expiry"
  | "subscription_billing"
  | "recurring_deposit";

export type ViewScope = "all" | "personal" | "family";

export interface CalendarEventRecord {
  id: number;
  userId: number;
  familyId: number | null;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  category: string;
  sourceDocumentId: number | null;
  reminderMinutesBefore: number | null;
  isReminderSent: boolean;
  isShared: boolean;
  createdAt: Date;
}

export interface PublicCalendarEvent {
  id: string;
  userId: number;
  title: string;
  description: string | null;
  date: string;
  time: string | null;
  endDate: string;
  isAllDay: boolean;
  category: CalendarCategory;
  isShared: boolean;
  /** false for derived events (document expiry, billing, recurring) */
  editable: boolean;
  sourceDocumentId: number | null;
  ownerName: string;
}

export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 0, 0, 0, 0));
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: unknown): value is string {
  return typeof value === "string" && DATE_KEY_RE.test(value);
}

/** Inclusive calendar-day range. If time is set on a single day, end is +1 hour. */
export function eventTimesFromRange(
  date: string,
  endDate: string | null | undefined,
  time: string | null | undefined,
): { startTime: Date; endTime: Date; isAllDay: boolean } {
  const startKey = endDate && endDate < date ? endDate : date;
  const endKey = endDate && endDate > date ? endDate : date;
  const isAllDay = !(typeof time === "string" && /^\d{2}:\d{2}$/.test(time));
  const startTime = parseDateKey(startKey);
  const endTime = parseDateKey(endKey);
  if (!isAllDay && typeof time === "string") {
    const [hh, mm] = time.split(":").map(Number);
    startTime.setUTCHours(hh!, mm, 0, 0);
    if (startKey === endKey) {
      return { startTime, endTime: new Date(startTime.getTime() + 60 * 60 * 1000), isAllDay: false };
    }
  }
  endTime.setUTCHours(23, 59, 59, 999);
  return { startTime, endTime, isAllDay };
}

export function timeFromDate(d: Date, isAllDay: boolean): string | null {
  if (isAllDay) return null;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function toPublicCalendarEvent(
  record: CalendarEventRecord,
  ownerName: string,
  editable = true,
): PublicCalendarEvent {
  const category = (record.category as CalendarCategory) || "personal";
  return {
    id: String(record.id),
    userId: record.userId,
    title: record.title,
    description: record.description,
    date: toDateKey(record.startTime),
    time: timeFromDate(record.startTime, record.isAllDay),
    endDate: toDateKey(record.endTime),
    isAllDay: record.isAllDay,
    category,
    isShared: record.isShared,
    editable,
    sourceDocumentId: record.sourceDocumentId,
    ownerName,
  };
}
