import { eventTimesFromRange, toDateKey } from "../domain/calendarTypes.js";

/** Subtract calendar months in UTC date-only space (clamps to month end). */
export function addUtcMonths(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last), 0, 0, 0, 0));
}

/** Reminder day = expiry − 2 months (same calendar day when possible). */
export function documentExpiryReminderDay(expiryDate: Date): Date {
  return addUtcMonths(expiryDate, -2);
}

export function documentExpiryReminderTitle(typeLabel: string): string {
  return `${typeLabel} · 만료 2개월 전`;
}

export function documentExpiryReminderDescription(expiryDate: Date): string {
  return `만료일 ${toDateKey(expiryDate)}`;
}

/** All-day event window for the reminder day + morning push (1h before 09:00 anchor). */
export function documentExpiryReminderEventTimes(expiryDate: Date): {
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  reminderMinutesBefore: number;
} {
  const day = documentExpiryReminderDay(expiryDate);
  const key = toDateKey(day);
  const { startTime, endTime, isAllDay } = eventTimesFromRange(key, key, null, null);
  return { startTime, endTime, isAllDay, reminderMinutesBefore: 60 };
}
