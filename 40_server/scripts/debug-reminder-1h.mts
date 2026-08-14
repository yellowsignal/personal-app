/**
 * Reproduce 1h-before reminder due-window / push path without Postgres.
 *
 * Usage (from repo root):
 *   npx tsx 40_server/scripts/debug-reminder-1h.mts
 *
 * Writes NDJSON to /opt/cursor/logs/debug.log (same as server instrumentation).
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import webpush from "web-push";
import { MemoryAuthRepository } from "../src/domain/memoryAuthRepository.js";
import { MemoryCalendarRepository } from "../src/domain/memoryCalendarRepository.js";
import { MemoryPushRepository } from "../src/domain/memoryPushRepository.js";
import { eventTimesFromRange } from "../src/domain/calendarTypes.js";
import { ReminderDispatcher, reminderFireAt, reminderLatestAt, isReminderDue } from "../src/services/reminderDispatcher.js";
import { PushService, type PushPayload } from "../src/services/pushService.js";

const LOG = "/opt/cursor/logs/debug.log";

function log(hypothesisId: string, message: string, data: Record<string, unknown>) {
  mkdirSync(dirname(LOG), { recursive: true });
  appendFileSync(
    LOG,
    `${JSON.stringify({ hypothesisId, location: "debug-reminder-1h.mts", message, data, timestamp: Date.now(), runId: "repro" })}\n`,
  );
}

async function main() {
  const authRepo = new MemoryAuthRepository();
  const calendarRepo = new MemoryCalendarRepository();
  const pushRepo = new MemoryPushRepository();
  const delivered: PushPayload[] = [];
  const keys = { ...webpush.generateVAPIDKeys(), subject: "mailto:debug@example.com" };
  const pushService = new PushService(pushRepo, keys, {
    async send(_sub, payload) {
      delivered.push(payload);
      return "ok";
    },
  });

  const { user } = await authRepo.createOwnerWithFamily({
    email: "debug-reminder@example.com",
    passwordHash: "x",
    name: "민호",
    familyName: "최가네",
    inviteCode: "DEBUG1",
    languagePref: "ko",
    countryPref: "KR",
    currencyPref: "KRW",
  });
  await pushRepo.upsert({
    userId: user.id,
    endpoint: "https://push.example/debug-1h",
    p256dh: "p256",
    auth: "auth",
    userAgent: "debug",
  });

  const now = new Date();
  log("E", "repro_start", { nowIso: now.toISOString(), tzOffsetMin: now.getTimezoneOffset() });

  // Case 1: timed event starting in 50m, reminder 60m → fire was 10m ago → SHOULD be due (catch-up)
  {
    const start = new Date(now.getTime() + 50 * 60_000);
    const date = start.toISOString().slice(0, 10);
    const time = start.toISOString().slice(11, 16);
    const times = eventTimesFromRange(date, date, time, null);
    const fireAt = reminderFireAt(times.startTime, 60, false);
    const latestAt = reminderLatestAt(times.startTime, times.endTime, false);
    const due = isReminderDue(now, fireAt, latestAt);
    log("A", "case1_timed_50m_ahead_60m_reminder", {
      startIso: times.startTime.toISOString(),
      fireAtIso: fireAt.toISOString(),
      latestAtIso: latestAt.toISOString(),
      due,
      expectDue: true,
    });
    await calendarRepo.create({
      userId: user.id,
      familyId: user.familyId,
      title: "테스트-timed-50m",
      description: null,
      startTime: times.startTime,
      endTime: times.endTime,
      isAllDay: false,
      category: "personal",
      isShared: false,
      reminderMinutesBefore: 60,
    });
  }

  // Case 2: timed event starting in 90m, reminder 60m → fire in 30m → NOT due yet
  {
    const start = new Date(now.getTime() + 90 * 60_000);
    const date = start.toISOString().slice(0, 10);
    const time = start.toISOString().slice(11, 16);
    const times = eventTimesFromRange(date, date, time, null);
    const fireAt = reminderFireAt(times.startTime, 60, false);
    const latestAt = reminderLatestAt(times.startTime, times.endTime, false);
    log("A", "case2_timed_90m_ahead_60m_reminder", {
      startIso: times.startTime.toISOString(),
      fireAtIso: fireAt.toISOString(),
      latestAtIso: latestAt.toISOString(),
      due: isReminderDue(now, fireAt, latestAt),
      expectDue: false,
    });
    await calendarRepo.create({
      userId: user.id,
      familyId: user.familyId,
      title: "테스트-timed-90m",
      description: null,
      startTime: times.startTime,
      endTime: times.endTime,
      isAllDay: false,
      category: "personal",
      isShared: false,
      reminderMinutesBefore: 60,
    });
  }

  // Case 3: all-day today, reminder 60 → fire 08:00 UTC; due if now in [08:00, end]
  {
    const date = now.toISOString().slice(0, 10);
    const times = eventTimesFromRange(date, date, null, null);
    const fireAt = reminderFireAt(times.startTime, 60, true);
    const latestAt = reminderLatestAt(times.startTime, times.endTime, true);
    log("B", "case3_allday_today_60m", {
      startIso: times.startTime.toISOString(),
      endIso: times.endTime.toISOString(),
      fireAtIso: fireAt.toISOString(),
      latestAtIso: latestAt.toISOString(),
      due: isReminderDue(now, fireAt, latestAt),
      isAllDay: times.isAllDay,
    });
    await calendarRepo.create({
      userId: user.id,
      familyId: user.familyId,
      title: "테스트-allday",
      description: null,
      startTime: times.startTime,
      endTime: times.endTime,
      isAllDay: true,
      category: "personal",
      isShared: false,
      reminderMinutesBefore: 60,
    });
  }

  // Case 4: floating "local-looking" afternoon time vs real now (KST-style mismatch probe)
  {
    const date = now.toISOString().slice(0, 10);
    const times = eventTimesFromRange(date, date, "15:00", null);
    const fireAt = reminderFireAt(times.startTime, 60, false);
    const latestAt = reminderLatestAt(times.startTime, times.endTime, false);
    log("A", "case4_floating_1500_utc_vs_now", {
      nowIso: now.toISOString(),
      startIso: times.startTime.toISOString(),
      fireAtIso: fireAt.toISOString(),
      latestAtIso: latestAt.toISOString(),
      due: isReminderDue(now, fireAt, latestAt),
      note: "UI stores HH:mm as UTC hours; wall-clock TZ may make this look late/early",
    });
  }

  // Case 5: already marked reminderSentFor for today's key
  {
    const start = new Date(now.getTime() + 40 * 60_000);
    const date = start.toISOString().slice(0, 10);
    const time = start.toISOString().slice(11, 16);
    const times = eventTimesFromRange(date, date, time, null);
    const row = await calendarRepo.create({
      userId: user.id,
      familyId: user.familyId,
      title: "테스트-already-sent",
      description: null,
      startTime: times.startTime,
      endTime: times.endTime,
      isAllDay: false,
      category: "personal",
      isShared: false,
      reminderMinutesBefore: 60,
    });
    await calendarRepo.update(row.id, { reminderSentFor: date, isReminderSent: true });
    log("C", "case5_premarked_sent", { eventId: row.id, reminderSentFor: date });
  }

  const dispatcher = new ReminderDispatcher(authRepo, calendarRepo, pushService);
  const sent = await dispatcher.tick(now);
  log("E", "repro_tick_result", {
    sent,
    deliveredTitles: delivered.map((d) => d.title),
    deliveredCount: delivered.length,
  });

  console.log(JSON.stringify({ sent, deliveredTitles: delivered.map((d) => d.title) }, null, 2));
  console.log(`debug log: ${LOG}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
