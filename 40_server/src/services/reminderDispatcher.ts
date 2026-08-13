import type { AuthRepository } from "../domain/authRepository.js";
import type { CalendarRepository } from "../domain/calendarRepository.js";
import type { CalendarEventRecord } from "../domain/calendarTypes.js";
import { toDateKey } from "../domain/calendarTypes.js";
import { expandRecurrence, shiftDateTime } from "../domain/recurrence.js";
import { utcDateOnly } from "../domain/recurringDepositTypes.js";
import type { PushService } from "./pushService.js";

/** Still deliver if we missed the exact fire minute (scheduler lag / create-after-fire). */
const CATCHUP_AFTER_START_MS = 2 * 60 * 60 * 1000;
/** All-day reminders are anchored to this floating clock on the occurrence day. */
const ALL_DAY_ANCHOR_HOUR_UTC = 9;

export function reminderFireAt(start: Date, minutesBefore: number, isAllDay: boolean): Date {
  if (!isAllDay) {
    return new Date(start.getTime() - minutesBefore * 60_000);
  }
  // All-day: treat "1 hour before" as 08:00 on the day (09:00 anchor − 60m), not 23:00 previous UTC day.
  const anchor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), ALL_DAY_ANCHOR_HOUR_UTC, 0, 0, 0));
  return new Date(anchor.getTime() - minutesBefore * 60_000);
}

export function reminderLatestAt(start: Date, end: Date, isAllDay: boolean): Date {
  if (isAllDay) return end;
  return new Date(start.getTime() + CATCHUP_AFTER_START_MS);
}

export function isReminderDue(now: Date, fireAt: Date, latestAt: Date): boolean {
  const t = now.getTime();
  return t >= fireAt.getTime() && t <= latestAt.getTime();
}

export class ReminderDispatcher {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly calendarRepo: CalendarRepository,
    private readonly pushService: PushService,
  ) {}

  async tick(now = new Date()): Promise<number> {
    const events = await this.calendarRepo.listWithReminders();
    let sent = 0;
    for (const ev of events) {
      if (ev.reminderMinutesBefore == null) continue;
      const dueKeys = this.dueOccurrenceKeys(ev, now);
      for (const { key, start } of dueKeys) {
        if (ev.reminderSentFor === key) continue;
        const recipients = await this.recipientIds(ev);
        const body = ev.isAllDay
          ? ev.title
          : `${String(start.getUTCHours()).padStart(2, "0")}:${String(start.getUTCMinutes()).padStart(2, "0")} · ${ev.title}`;
        const delivered = await this.pushService.sendToUsers(recipients, {
          title: ev.title,
          body,
          url: "/calendar",
          tag: `cal-${ev.id}-${key}`,
        });
        if (delivered < 1) {
          console.warn(`[reminders] no push endpoint for event ${ev.id} (${ev.title}) recipients=${recipients.join(",")}`);
          continue;
        }
        await this.calendarRepo.update(ev.id, {
          isReminderSent: ev.recurrence ? ev.isReminderSent : true,
          reminderSentFor: key,
        });
        ev.reminderSentFor = key;
        sent += 1;
        console.log(`[reminders] sent event=${ev.id} occ=${key} title=${ev.title}`);
      }
    }
    return sent;
  }

  private dueOccurrenceKeys(
    ev: CalendarEventRecord,
    now: Date,
  ): Array<{ key: string; start: Date }> {
    const minutes = ev.reminderMinutesBefore ?? 0;
    const out: Array<{ key: string; start: Date }> = [];

    if (!ev.recurrence) {
      const fireAt = reminderFireAt(ev.startTime, minutes, ev.isAllDay);
      const latestAt = reminderLatestAt(ev.startTime, ev.endTime, ev.isAllDay);
      if (isReminderDue(now, fireAt, latestAt)) {
        out.push({ key: toDateKey(ev.startTime), start: ev.startTime });
      }
      return out;
    }

    const startDay = utcDateOnly(ev.startTime);
    // Look far enough back that a "1 day before" all-day reminder can still catch up on the day.
    const from = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000 - minutes * 60_000);
    const to = new Date(now.getTime() + minutes * 60_000 + 24 * 60 * 60 * 1000);
    const occs = expandRecurrence(ev.recurrence, startDay, from, to);
    for (const occ of occs) {
      const start = shiftDateTime(ev.startTime, startDay, occ);
      const end = shiftDateTime(ev.endTime, startDay, occ);
      const fireAt = reminderFireAt(start, minutes, ev.isAllDay);
      const latestAt = reminderLatestAt(start, end, ev.isAllDay);
      if (isReminderDue(now, fireAt, latestAt)) {
        out.push({ key: toDateKey(occ), start });
      }
    }
    return out;
  }

  private async recipientIds(ev: { userId: number; isShared: boolean; familyId: number | null }): Promise<number[]> {
    if (!ev.isShared || ev.familyId == null) return [ev.userId];
    const members = await this.authRepo.listFamilyMembers(ev.familyId);
    const ids = members.map((m) => m.id);
    if (!ids.includes(ev.userId)) ids.push(ev.userId);
    return ids;
  }
}

export function startReminderScheduler(dispatcher: ReminderDispatcher, intervalMs = 60_000): () => void {
  const run = () => {
    void dispatcher.tick().catch((err) => {
      console.error("[reminders] tick failed", err);
    });
  };
  const delay = setTimeout(run, 8_000);
  const interval = setInterval(run, intervalMs);
  return () => {
    clearTimeout(delay);
    clearInterval(interval);
  };
}
