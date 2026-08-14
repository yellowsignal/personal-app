import type { AuthRepository } from "../domain/authRepository.js";
import type { CalendarRepository } from "../domain/calendarRepository.js";
import type { CalendarEventRecord } from "../domain/calendarTypes.js";
import { toDateKey } from "../domain/calendarTypes.js";
import { expandRecurrence, shiftDateTime } from "../domain/recurrence.js";
import { utcDateOnly } from "../domain/recurringDepositTypes.js";
import { agentLog } from "../debugNdjson.js";
import type { PushService } from "./pushService.js";

/** Still deliver if we missed the exact fire minute (scheduler lag / create-after-fire). */
const CATCHUP_AFTER_START_MS = 2 * 60 * 60 * 1000;
/** All-day reminders are anchored to this floating clock on the occurrence day. */
const ALL_DAY_ANCHOR_HOUR_UTC = 9;
/** Product default when country pref is missing / BOTH / unknown. */
const DEFAULT_REMINDER_TZ = "Asia/Tokyo";

/**
 * Map holiday country pref → IANA zone for reminder wall-clock.
 * KR/JP are both UTC+9 (no DST); BOTH defaults to Tokyo.
 */
export function timeZoneFromCountryPref(pref: string | null | undefined): string {
  const p = (pref ?? "JP").trim().toUpperCase();
  if (p === "KR") return "Asia/Seoul";
  return DEFAULT_REMINDER_TZ;
}

/**
 * Calendar times are stored as floating UTC (HH:mm via setUTCHours).
 * Project real `now` into the same floating timeline using the owner's wall clock.
 */
export function toFloatingNow(now: Date, timeZone: string): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return new Date(
    Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
      now.getUTCMilliseconds(),
    ),
  );
}

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
    const tzByUser = new Map<number, string>();
    // #region agent log
    agentLog("D", "reminderDispatcher.ts:tick", "tick start", {
      eventCount: events.length,
      withReminder: events.filter((e) => e.reminderMinutesBefore != null).length,
      nowIso: now.toISOString(),
      processTz: process.env.TZ ?? null,
      resolvedTz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    agentLog("B", "reminderDispatcher.ts:tick", "listWithReminders sample", {
      minutes: events.slice(0, 8).map((e) => ({
        id: e.id,
        minutes: e.reminderMinutesBefore,
        isAllDay: e.isAllDay,
        startIso: e.startTime.toISOString(),
        utcHours: e.startTime.getUTCHours(),
        sentFor: e.reminderSentFor,
      })),
    });
    // #endregion

    for (const ev of events) {
      try {
        sent += await this.dispatchEvent(ev, now, tzByUser);
      } catch (err) {
        console.error(`[reminders] event ${ev.id} failed`, err);
        // #region agent log
        agentLog("H", "reminderDispatcher.ts:tick", "event failed isolated", {
          eventId: ev.id,
          userId: ev.userId,
          err: err instanceof Error ? err.message : String(err),
          runId: "post-fix",
        });
        // #endregion
      }
    }
    return sent;
  }

  private async dispatchEvent(
    ev: CalendarEventRecord,
    now: Date,
    tzByUser: Map<number, string>,
  ): Promise<number> {
    if (ev.reminderMinutesBefore == null) return 0;
    let sent = 0;
    let tz = tzByUser.get(ev.userId);
    if (!tz) {
      const owner = await this.authRepo.findUserById(ev.userId);
      const ownerCountry = owner?.countryPref ?? null;
      tz = timeZoneFromCountryPref(ownerCountry);
      tzByUser.set(ev.userId, tz);
      // #region agent log
      agentLog("H", "reminderDispatcher.ts:tick", "findUserById ok", {
        eventId: ev.id,
        userId: ev.userId,
        countryPref: ownerCountry,
        tz,
      });
      // #endregion
    }
    const floatingNow = toFloatingNow(now, tz);
    const minutes = ev.reminderMinutesBefore;
    const fireAt = reminderFireAt(ev.startTime, minutes, ev.isAllDay);
    const latestAt = reminderLatestAt(ev.startTime, ev.endTime, ev.isAllDay);
    const dueKeys = this.dueOccurrenceKeys(ev, floatingNow);
    // #region agent log
    agentLog("A", "reminderDispatcher.ts:tick", "due check", {
      eventId: ev.id,
      title: ev.title,
      isAllDay: ev.isAllDay,
      minutes,
      startIso: ev.startTime.toISOString(),
      utcHours: ev.startTime.getUTCHours(),
      fireAt: fireAt.toISOString(),
      latestAt: latestAt.toISOString(),
      floatingNow: floatingNow.toISOString(),
      realNow: now.toISOString(),
      tz,
      due: dueKeys.length > 0,
      dueKeys: dueKeys.map((d) => d.key),
      reminderSentFor: ev.reminderSentFor,
      windowHours: (latestAt.getTime() - fireAt.getTime()) / 3_600_000,
    });
    // #endregion
    for (const { key, start } of dueKeys) {
      if (ev.reminderSentFor === key) {
        // #region agent log
        agentLog("F", "reminderDispatcher.ts:tick", "skip already sent", {
          eventId: ev.id,
          key,
        });
        // #endregion
        continue;
      }
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
        // #region agent log
        agentLog("C", "reminderDispatcher.ts:tick", "delivered=0 not marked sent", {
          eventId: ev.id,
          recipients,
        });
        // #endregion
        continue;
      }
      await this.calendarRepo.update(ev.id, {
        isReminderSent: ev.recurrence ? ev.isReminderSent : true,
        reminderSentFor: key,
      });
      ev.reminderSentFor = key;
      sent += 1;
      console.log(`[reminders] sent event=${ev.id} occ=${key} title=${ev.title} tz=${tz}`);
    }
    return sent;
  }

  private dueOccurrenceKeys(
    ev: CalendarEventRecord,
    floatingNow: Date,
  ): Array<{ key: string; start: Date }> {
    const minutes = ev.reminderMinutesBefore ?? 0;
    const out: Array<{ key: string; start: Date }> = [];

    if (!ev.recurrence) {
      const fireAt = reminderFireAt(ev.startTime, minutes, ev.isAllDay);
      const latestAt = reminderLatestAt(ev.startTime, ev.endTime, ev.isAllDay);
      if (isReminderDue(floatingNow, fireAt, latestAt)) {
        out.push({ key: toDateKey(ev.startTime), start: ev.startTime });
      }
      return out;
    }

    const startDay = utcDateOnly(ev.startTime);
    // Look far enough back that a "1 day before" all-day reminder can still catch up on the day.
    const from = new Date(floatingNow.getTime() - 3 * 24 * 60 * 60 * 1000 - minutes * 60_000);
    const to = new Date(floatingNow.getTime() + minutes * 60_000 + 24 * 60 * 60 * 1000);
    const occs = expandRecurrence(ev.recurrence, startDay, from, to);
    for (const occ of occs) {
      const start = shiftDateTime(ev.startTime, startDay, occ);
      const end = shiftDateTime(ev.endTime, startDay, occ);
      const fireAt = reminderFireAt(start, minutes, ev.isAllDay);
      const latestAt = reminderLatestAt(start, end, ev.isAllDay);
      if (isReminderDue(floatingNow, fireAt, latestAt)) {
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
  // #region agent log
  agentLog("D", "reminderDispatcher.ts:startReminderScheduler", "scheduler armed", {
    intervalMs,
    firstTickDelayMs: 8_000,
  });
  // #endregion
  const run = () => {
    void dispatcher.tick().catch((err) => {
      console.error("[reminders] tick failed", err);
      // #region agent log
      agentLog("D", "reminderDispatcher.ts:startReminderScheduler", "tick failed", {
        err: err instanceof Error ? err.message : String(err),
      });
      // #endregion
    });
  };
  const delay = setTimeout(run, 8_000);
  const interval = setInterval(run, intervalMs);
  return () => {
    clearTimeout(delay);
    clearInterval(interval);
  };
}
