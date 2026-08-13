import type { AuthRepository } from "../domain/authRepository.js";
import type { CalendarRepository } from "../domain/calendarRepository.js";
import { toDateKey } from "../domain/calendarTypes.js";
import { expandRecurrence, shiftDateTime } from "../domain/recurrence.js";
import { utcDateOnly } from "../domain/recurringDepositTypes.js";
import type { PushService } from "./pushService.js";

const GRACE_MS = 2 * 60 * 60 * 1000;

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
        await this.pushService.sendToUsers(recipients, {
          title: ev.title,
          body,
          url: "/calendar",
          tag: `cal-${ev.id}-${key}`,
        });
        await this.calendarRepo.update(ev.id, {
          isReminderSent: ev.recurrence ? ev.isReminderSent : true,
          reminderSentFor: key,
        });
        ev.reminderSentFor = key;
        sent += 1;
      }
    }
    return sent;
  }

  private dueOccurrenceKeys(
    ev: Awaited<ReturnType<CalendarRepository["listWithReminders"]>>[number],
    now: Date,
  ): Array<{ key: string; start: Date }> {
    const minutes = ev.reminderMinutesBefore ?? 0;
    const nowMs = now.getTime();
    const out: Array<{ key: string; start: Date }> = [];

    if (!ev.recurrence) {
      const fireAt = ev.startTime.getTime() - minutes * 60_000;
      if (nowMs >= fireAt && nowMs <= fireAt + GRACE_MS) {
        out.push({ key: toDateKey(ev.startTime), start: ev.startTime });
      }
      return out;
    }

    const startDay = utcDateOnly(ev.startTime);
    const from = new Date(nowMs - GRACE_MS - minutes * 60_000);
    const to = new Date(nowMs + minutes * 60_000 + 24 * 60 * 60 * 1000);
    const occs = expandRecurrence(ev.recurrence, startDay, from, to);
    for (const occ of occs) {
      const start = shiftDateTime(ev.startTime, startDay, occ);
      const fireAt = start.getTime() - minutes * 60_000;
      if (nowMs >= fireAt && nowMs <= fireAt + GRACE_MS) {
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
