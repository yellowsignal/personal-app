/**
 * Verify 1h-before reminders align with KR/JP wall clock (floating UTC store).
 *
 * Usage: npx tsx 40_server/scripts/debug-reminder-1h.mts
 */
import webpush from "web-push";
import { MemoryAuthRepository } from "../src/domain/memoryAuthRepository.js";
import { MemoryCalendarRepository } from "../src/domain/memoryCalendarRepository.js";
import { MemoryPushRepository } from "../src/domain/memoryPushRepository.js";
import { eventTimesFromRange } from "../src/domain/calendarTypes.js";
import {
  ReminderDispatcher,
  reminderFireAt,
  reminderLatestAt,
  isReminderDue,
  toFloatingNow,
  timeZoneFromCountryPref,
} from "../src/services/reminderDispatcher.js";
import { PushService, type PushPayload } from "../src/services/pushService.js";

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

  const tz = timeZoneFromCountryPref(user.countryPref);
  // Real UTC morning = 14:00 KST — classic failure case before the fix.
  const realNow = new Date("2026-08-14T05:00:00.000Z");
  const floatingNow = toFloatingNow(realNow, tz);

  const times = eventTimesFromRange("2026-08-14", "2026-08-14", "15:00", null);
  const fireAt = reminderFireAt(times.startTime, 60, false);
  const latestAt = reminderLatestAt(times.startTime, times.endTime, false);

  console.log(
    JSON.stringify(
      {
        tz,
        realNow: realNow.toISOString(),
        floatingNow: floatingNow.toISOString(),
        start: times.startTime.toISOString(),
        fireAt: fireAt.toISOString(),
        dueWithFloating: isReminderDue(floatingNow, fireAt, latestAt),
        dueWithRawUtc: isReminderDue(realNow, fireAt, latestAt),
      },
      null,
      2,
    ),
  );

  await calendarRepo.create({
    userId: user.id,
    familyId: user.familyId,
    title: "테스트",
    description: null,
    startTime: times.startTime,
    endTime: times.endTime,
    isAllDay: false,
    category: "personal",
    isShared: false,
    reminderMinutesBefore: 60,
  });

  // All-day: at 14:00 floating should be due (fire 08:00)
  const allDay = eventTimesFromRange("2026-08-14", "2026-08-14", null, null);
  await calendarRepo.create({
    userId: user.id,
    familyId: user.familyId,
    title: "테스트-allday",
    description: null,
    startTime: allDay.startTime,
    endTime: allDay.endTime,
    isAllDay: true,
    category: "personal",
    isShared: false,
    reminderMinutesBefore: 60,
  });

  const dispatcher = new ReminderDispatcher(authRepo, calendarRepo, pushService);
  const sent = await dispatcher.tick(realNow);
  console.log(JSON.stringify({ sent, deliveredTitles: delivered.map((d) => d.title) }, null, 2));

  if (sent < 2 || !delivered.some((d) => d.title === "테스트")) {
    console.error("FAIL: expected timed + all-day reminders at 14:00 KST");
    process.exit(1);
  }
  console.log("OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
