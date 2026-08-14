/**
 * MEMORY + Prisma-timestamp simulation for calendar 1h Web Push.
 *
 * Parent repro (from repo root):
 *   rm -f /opt/cursor/logs/debug.log
 *   node --import tsx 40_server/scripts/repro-reminder-dispatch.ts
 *
 * Writes NDJSON to /opt/cursor/logs/debug.log and prints a hypothesis table.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import webpush from "web-push";
import { createApp } from "../src/app.js";
import { TaskStore } from "../src/store.js";
import { MemoryAuthRepository } from "../src/domain/memoryAuthRepository.js";
import { MemoryCalendarRepository } from "../src/domain/memoryCalendarRepository.js";
import { MemoryPushRepository } from "../src/domain/memoryPushRepository.js";
import { ChallengeStore } from "../src/auth/challengeStore.js";
import { MemoryPasskeyRepository } from "../src/domain/memoryPasskeyRepository.js";
import { MemoryInviteTokenRepository } from "../src/domain/memoryInviteTokenRepository.js";
import { PushService, type PushPayload } from "../src/services/pushService.js";
import {
  ReminderDispatcher,
  isReminderDue,
  reminderFireAt,
  reminderLatestAt,
  toFloatingNow,
} from "../src/services/reminderDispatcher.js";
import { eventTimesFromRange } from "../src/domain/calendarTypes.js";
import { agentLog } from "../src/debugNdjson.js";

function tmpStore(): TaskStore {
  const dir = mkdtempSync(join(tmpdir(), "personal-app-"));
  return new TaskStore(join(dir, "tasks.json"));
}

async function listen(app: ReturnType<typeof createApp>) {
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("expected TCP address");
  return { server, base: `http://127.0.0.1:${address.port}` };
}

/** Prisma TIMESTAMP WITHOUT TIME ZONE: session TZ wall clock stored naive, read back as UTC. */
function simulatePgTimestampWithoutTzRoundTrip(input: Date, sessionTimeZone: string): Date {
  return toFloatingNow(input, sessionTimeZone);
}

type Verdict = "PASS" | "FAIL" | "INFO";
const results: Array<{ id: string; verdict: Verdict; detail: string }> = [];

function record(id: string, verdict: Verdict, detail: string) {
  results.push({ id, verdict, detail });
  agentLog(id[0] ?? "X", "repro-reminder-dispatch.ts", `${id} ${verdict}`, { detail });
  console.log(`[${verdict}] ${id}: ${detail}`);
}

async function boot() {
  const authRepo = new MemoryAuthRepository();
  const calendarRepo = new MemoryCalendarRepository();
  const pushRepo = new MemoryPushRepository();
  const delivered: PushPayload[] = [];
  const keys = { ...webpush.generateVAPIDKeys(), subject: "mailto:test@example.com" };
  const pushService = new PushService(pushRepo, keys, {
    async send(_sub, payload) {
      delivered.push(payload);
      return "ok";
    },
  });
  const app = createApp(tmpStore(), {
    authRepo,
    calendarRepo,
    pushService,
    passkeyRepo: new MemoryPasskeyRepository(),
    inviteTokenRepo: new MemoryInviteTokenRepository(),
    challengeStore: new ChallengeStore(),
    jwtSecret: "test-secret",
  });
  const { server, base } = await listen(app);
  return { authRepo, calendarRepo, pushRepo, pushService, delivered, server, base };
}

async function register(base: string, email: string, countryPref: string) {
  const register = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "password123",
      name: "민호",
      familyName: "최가네",
      countryPref,
    }),
  });
  assert.equal(register.status, 201);
  return (await register.json()) as { token: string };
}

async function subscribe(base: string, token: string, endpoint: string) {
  const sub = await fetch(`${base}/api/push/subscribe`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ endpoint, keys: { p256dh: "p256", auth: "auth-token" } }),
  });
  assert.equal(sub.status, 201);
}

async function createEvent(
  base: string,
  token: string,
  body: Record<string, unknown>,
): Promise<{ id: string; time: string | null; isAllDay: boolean; reminderMinutesBefore: number | null }> {
  const created = await fetch(`${base}/api/calendar/events`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const text = await created.text();
  assert.equal(created.status, 201, text);
  return JSON.parse(text) as {
    id: string;
    time: string | null;
    isAllDay: boolean;
    reminderMinutesBefore: number | null;
  };
}

async function scenarioA() {
  const stored = eventTimesFromRange("2026-08-14", "2026-08-14", "15:00").startTime;
  assert.equal(stored.toISOString(), "2026-08-14T15:00:00.000Z");
  const utcSession = simulatePgTimestampWithoutTzRoundTrip(stored, "UTC");
  assert.equal(utcSession.toISOString(), stored.toISOString());

  const tokyoShift = simulatePgTimestampWithoutTzRoundTrip(stored, "Asia/Tokyo");
  const seoulShift = simulatePgTimestampWithoutTzRoundTrip(stored, "Asia/Seoul");
  const fireAtShifted = reminderFireAt(tokyoShift, 60, false);
  const latestShifted = reminderLatestAt(tokyoShift, new Date(tokyoShift.getTime() + 3600_000), false);
  const floating14 = toFloatingNow(new Date("2026-08-14T05:00:00.000Z"), "Asia/Seoul");
  const dueAfterShift = isReminderDue(floating14, fireAtShifted, latestShifted);
  const fireAtOk = reminderFireAt(stored, 60, false);
  const latestOk = reminderLatestAt(stored, new Date(stored.getTime() + 3600_000), false);
  const dueUnshifted = isReminderDue(floating14, fireAtOk, latestOk);

  agentLog("A", "repro-reminder-dispatch.ts", "prisma timestamp simulation", {
    storedIso: stored.toISOString(),
    tokyoShiftIso: tokyoShift.toISOString(),
    seoulShiftIso: seoulShift.toISOString(),
    utcHoursAfterTokyo: tokyoShift.getUTCHours(),
    fireAtShifted: fireAtShifted.toISOString(),
    latestShifted: latestShifted.toISOString(),
    floating14: floating14.toISOString(),
    dueAfterShift,
    dueUnshifted,
  });

  record(
    "A-unshifted",
    dueUnshifted ? "PASS" : "FAIL",
    `MEMORY/UTC-session 15:00Z 1h reminder due at 14:00 floating (due=${dueUnshifted})`,
  );
  record(
    "A-shifted-tokyo",
    dueAfterShift ? "FAIL" : "INFO",
    `IF Prisma TIMESTAMP WITHOUT TZ uses session Asia/Tokyo, 15:00Z → ${tokyoShift.toISOString()} and due at 14:00 floating=${dueAfterShift} (catch-up missed)`,
  );
}

async function scenarioE_B_C_F() {
  const { authRepo, calendarRepo, pushService, delivered, server, base } = await boot();
  try {
    const owner = await register(base, "repro-kr@example.com", "KR");
    await subscribe(base, owner.token, "https://push.example/iphone");

    const uiDefault = await createEvent(base, owner.token, {
      title: "종일 기본값",
      date: "2026-08-14",
      time: null,
      reminderMinutesBefore: 60,
    });
    record(
      "E-ui-default",
      uiDefault.isAllDay && uiDefault.time == null && uiDefault.reminderMinutesBefore === 60 ? "PASS" : "FAIL",
      `create form default (empty time, reminder 60) → isAllDay=${uiDefault.isAllDay} time=${uiDefault.time} minutes=${uiDefault.reminderMinutesBefore}`,
    );

    const dispatcher = new ReminderDispatcher(authRepo, calendarRepo, pushService);
    const morning = await dispatcher.tick(new Date("2026-08-14T02:20:00.000Z")); // 11:20 KST
    record(
      "E-allday-due",
      morning >= 1 ? "PASS" : "FAIL",
      `all-day 1h reminder at 11:20 KST sent=${morning} (should catch up after 08:00 floating)`,
    );

    const timed = await createEvent(base, owner.token, {
      title: "15시 테스트",
      date: "2026-08-14",
      time: "15:00",
      reminderMinutesBefore: 60,
    });
    record(
      "E-timed-stored",
      timed.time === "15:00" && timed.reminderMinutesBefore === 60 ? "PASS" : "FAIL",
      `timed create stored time=${timed.time} minutes=${timed.reminderMinutesBefore}`,
    );

    const tooEarly = await dispatcher.tick(new Date("2026-08-14T02:20:00.000Z")); // 11:20 KST
    record(
      "E-timed-not-yet",
      tooEarly === 0 ? "INFO" : "FAIL",
      `timed 15:00 + 1h at 11:20 KST sent=${tooEarly} (not due until 14:00 KST — user may think it is broken)`,
    );

    const onTime = await dispatcher.tick(new Date("2026-08-14T05:00:00.000Z")); // 14:00 KST
    record(
      "A-memory-ontime",
      onTime >= 1 ? "PASS" : "FAIL",
      `MEMORY KR 15:00 1h reminder at 14:00 KST sent=${onTime}`,
    );

    const skip = await dispatcher.tick(new Date("2026-08-14T05:10:00.000Z"));
    record("F-already-sent", skip === 0 ? "PASS" : "FAIL", `second tick after mark sent=${skip} (expect 0)`);

    const none = await createEvent(base, owner.token, {
      title: "알림없음",
      date: "2026-08-14",
      time: "16:00",
      reminderMinutesBefore: null,
    });
    const listed = await calendarRepo.listWithReminders();
    const noneInList = listed.some((e) => e.id === Number(none.id));
    record(
      "B-null-skipped",
      none.reminderMinutesBefore == null && !noneInList ? "PASS" : "FAIL",
      `reminderMinutesBefore=null stored=${none.reminderMinutesBefore} in listWithReminders=${noneInList}`,
    );

    const noSubAuth = new MemoryAuthRepository();
    const noSubCal = new MemoryCalendarRepository();
    const noSubPush = new MemoryPushRepository();
    const keys = { ...webpush.generateVAPIDKeys(), subject: "mailto:test@example.com" };
    const silentPush = new PushService(noSubPush, keys, {
      async send() {
        return "ok";
      },
    });
    const app2 = createApp(tmpStore(), {
      authRepo: noSubAuth,
      calendarRepo: noSubCal,
      pushService: silentPush,
      passkeyRepo: new MemoryPasskeyRepository(),
      inviteTokenRepo: new MemoryInviteTokenRepository(),
      challengeStore: new ChallengeStore(),
      jwtSecret: "test-secret",
    });
    const { server: s2, base: b2 } = await listen(app2);
    try {
      const owner2 = await register(b2, "nosub@example.com", "KR");
      await createEvent(b2, owner2.token, {
        title: "구독없음",
        date: "2026-08-14",
        time: "15:00",
        reminderMinutesBefore: 60,
      });
      const d2 = new ReminderDispatcher(noSubAuth, noSubCal, silentPush);
      const sentNoSub = await d2.tick(new Date("2026-08-14T05:00:00.000Z"));
      const row = (await noSubCal.listWithReminders())[0];
      record(
        "C-no-subscription",
        sentNoSub === 0 && row?.reminderSentFor == null ? "PASS" : "FAIL",
        `no push sub → sent=${sentNoSub} reminderSentFor=${row?.reminderSentFor} (not marked; retries)`,
      );
    } finally {
      s2.close();
    }

    record("C-test-vs-reminder", "INFO", `MEMORY delivered payloads=${delivered.length} (settings test uses same sendToUsers)`);
  } finally {
    server.close();
  }
}

async function scenarioH() {
  const { authRepo, calendarRepo, pushRepo, pushService, delivered, server, base } = await boot();
  try {
    const owner = await register(base, "boom@example.com", "KR");
    await subscribe(base, owner.token, "https://push.example/boom");
    await createEvent(base, owner.token, {
      title: "boom-event",
      date: "2026-08-14",
      time: "15:00",
      reminderMinutesBefore: 60,
    });
    const sibling = await authRepo.createOwnerWithFamily({
      email: "ok-sibling@example.com",
      passwordHash: "x",
      name: "ok",
      familyName: "B",
      inviteCode: "OKSIBL01",
      languagePref: "ko",
      countryPref: "KR",
      currencyPref: "KRW",
    });
    await calendarRepo.create({
      userId: sibling.user.id,
      familyId: sibling.family.id,
      title: "ok-event",
      description: null,
      startTime: new Date("2026-08-14T15:00:00.000Z"),
      endTime: new Date("2026-08-14T16:00:00.000Z"),
      isAllDay: false,
      category: "personal",
      reminderMinutesBefore: 60,
      isShared: false,
    });
    await pushRepo.upsert({
      userId: sibling.user.id,
      endpoint: "https://push.example/ok-sibling",
      p256dh: "p256",
      auth: "auth-token",
      userAgent: null,
    });
    const boomUser = await authRepo.findUserByEmail("boom@example.com");
    const original = authRepo.findUserById.bind(authRepo);
    authRepo.findUserById = async (id: number) => {
      if (id === boomUser?.id) throw new Error("simulated findUserById failure");
      return original(id);
    };
    const dispatcher = new ReminderDispatcher(authRepo, calendarRepo, pushService);
    let threw = false;
    let sent = 0;
    try {
      sent = await dispatcher.tick(new Date("2026-08-14T05:00:00.000Z"));
    } catch {
      threw = true;
    }
    record(
      "H-tick-abort",
      !threw && sent === 1 && delivered.some((p) => p.title === "ok-event") ? "PASS" : "FAIL",
      `findUserById throw isolated → threw=${threw} sent=${sent} titles=${delivered.map((p) => p.title).join(",")}`,
    );
  } finally {
    server.close();
  }
}

async function scenarioD_G() {
  record(
    "D-code",
    "INFO",
    "index.ts listen() calls startReminderScheduler; systemd unit ExecStart=node dist/index.js (cannot verify dig systemd from this VM)",
  );
  record(
    "G-ios",
    "INFO",
    "enableHomeScreenPush requires Notification+PushManager+SW; iOS needs standalone PWA; tag cal-{id}-{date} ≤32 after topic sanitize; test push uses same sendToUsers",
  );
}

async function main() {
  console.log("process TZ", process.env.TZ ?? "(unset)", Intl.DateTimeFormat().resolvedOptions().timeZone);
  await scenarioA();
  await scenarioE_B_C_F();
  await scenarioH();
  await scenarioD_G();
  console.log("\n=== hypothesis table ===");
  for (const r of results) {
    console.log(`${r.verdict.padEnd(4)} ${r.id.padEnd(22)} ${r.detail}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
