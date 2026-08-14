import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import webpush from "web-push";
import { createApp } from "./app.js";
import { TaskStore } from "./store.js";
import { MemoryAuthRepository } from "./domain/memoryAuthRepository.js";
import { MemoryCalendarRepository } from "./domain/memoryCalendarRepository.js";
import { MemoryPushRepository } from "./domain/memoryPushRepository.js";
import { ChallengeStore } from "./auth/challengeStore.js";
import { MemoryPasskeyRepository } from "./domain/memoryPasskeyRepository.js";
import { MemoryInviteTokenRepository } from "./domain/memoryInviteTokenRepository.js";
import { PushService, type PushPayload } from "./services/pushService.js";
import { ReminderDispatcher, toFloatingNow } from "./services/reminderDispatcher.js";

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

test("web push subscribe and due calendar reminder is dispatched", async () => {
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
  try {
    const vapid = await fetch(`${base}/api/push/vapid-public-key`);
    assert.equal(vapid.status, 200);
    const vapidBody = (await vapid.json()) as { publicKey: string };
    assert.equal(vapidBody.publicKey, keys.publicKey);

    const register = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "push-owner@example.com",
        password: "password123",
        name: "민호",
        familyName: "최가네",
        countryPref: "JP",
      }),
    });
    assert.equal(register.status, 201);
    const owner = (await register.json()) as { token: string };

    const sub = await fetch(`${base}/api/push/subscribe`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        endpoint: "https://push.example/device-1",
        keys: { p256dh: "p256", auth: "auth-token" },
      }),
    });
    assert.equal(sub.status, 201);

    // Store floating clock times relative to owner's wall clock (not raw UTC ISO).
    const floatingNow = toFloatingNow(new Date(), "Asia/Tokyo");
    const start = new Date(floatingNow.getTime() + 5 * 60 * 1000);
    const date = start.toISOString().slice(0, 10);
    const time = start.toISOString().slice(11, 16);
    const created = await fetch(`${base}/api/calendar/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        title: "회의",
        date,
        time,
        reminderMinutesBefore: 10,
      }),
    });
    assert.equal(created.status, 201);

    const dispatcher = new ReminderDispatcher(authRepo, calendarRepo, pushService);
    const sent = await dispatcher.tick();
    assert.equal(sent, 1);
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0]?.title, "회의");

    const again = await dispatcher.tick();
    assert.equal(again, 0);
    assert.equal(delivered.length, 1);
  } finally {
    server.close();
  }
});

test("all-day reminder still fires when created after the ideal fire time", async () => {
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
  try {
    const register = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "allday-reminder@example.com",
        password: "password123",
        name: "민호",
        familyName: "최가네",
        countryPref: "JP",
      }),
    });
    assert.equal(register.status, 201);
    const owner = (await register.json()) as { token: string };

    await fetch(`${base}/api/push/subscribe`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        endpoint: "https://push.example/device-allday",
        keys: { p256dh: "p256", auth: "auth-token" },
      }),
    });

    // 06:00 UTC = 15:00 JST on the event day (floating afternoon after 08:00 fire).
    const now = new Date(Date.UTC(2026, 7, 14, 6, 0, 0));
    const created = await fetch(`${base}/api/calendar/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        title: "ダンボールごみ捨て",
        date: "2026-08-14",
        reminderMinutesBefore: 60,
      }),
    });
    assert.equal(created.status, 201);

    const dispatcher = new ReminderDispatcher(authRepo, calendarRepo, pushService);
    const sent = await dispatcher.tick(now);
    assert.equal(sent, 1);
    assert.equal(delivered[0]?.title, "ダンボールごみ捨て");
  } finally {
    server.close();
  }
});

test("timed 1h reminder fires at JST wall clock not raw UTC", async () => {
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
  try {
    const register = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "jst-reminder@example.com",
        password: "password123",
        name: "민호",
        familyName: "최가네",
        countryPref: "KR",
      }),
    });
    assert.equal(register.status, 201);
    const owner = (await register.json()) as { token: string };

    await fetch(`${base}/api/push/subscribe`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        endpoint: "https://push.example/device-jst",
        keys: { p256dh: "p256", auth: "auth-token" },
      }),
    });

    // User schedules 15:00 floating; at real 05:00 UTC (=14:00 KST) 1h-before should fire.
    const created = await fetch(`${base}/api/calendar/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        title: "테스트",
        date: "2026-08-14",
        time: "15:00",
        reminderMinutesBefore: 60,
      }),
    });
    assert.equal(created.status, 201);

    const dispatcher = new ReminderDispatcher(authRepo, calendarRepo, pushService);
    const tooEarly = await dispatcher.tick(new Date("2026-08-14T04:00:00.000Z")); // 13:00 KST
    assert.equal(tooEarly, 0);
    assert.equal(delivered.length, 0);

    const onTime = await dispatcher.tick(new Date("2026-08-14T05:00:00.000Z")); // 14:00 KST
    assert.equal(onTime, 1);
    assert.equal(delivered[0]?.title, "테스트");
  } finally {
    server.close();
  }
});

test("updating event time or reminder clears reminderSentFor", async () => {
  const authRepo = new MemoryAuthRepository();
  const calendarRepo = new MemoryCalendarRepository();
  const pushRepo = new MemoryPushRepository();
  const keys = { ...webpush.generateVAPIDKeys(), subject: "mailto:test@example.com" };
  const pushService = new PushService(pushRepo, keys, {
    async send() {
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
  try {
    const register = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "reset-reminder@example.com",
        password: "password123",
        name: "민호",
        familyName: "최가네",
      }),
    });
    assert.equal(register.status, 201);
    const owner = (await register.json()) as { token: string };

    const created = await fetch(`${base}/api/calendar/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        title: "리셋 테스트",
        date: "2026-08-14",
        time: "15:00",
        reminderMinutesBefore: 60,
      }),
    });
    assert.equal(created.status, 201);
    const ev = (await created.json()) as { id: string };
    const id = Number(ev.id);

    await calendarRepo.update(id, { isReminderSent: true, reminderSentFor: "2026-08-14" });
    const marked = await calendarRepo.findById(id);
    assert.equal(marked?.reminderSentFor, "2026-08-14");

    const patched = await fetch(`${base}/api/calendar/events/${id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        date: "2026-08-14",
        time: "16:00",
        reminderMinutesBefore: 60,
      }),
    });
    assert.equal(patched.status, 200);

    const after = await calendarRepo.findById(id);
    assert.equal(after?.reminderSentFor, null);
    assert.equal(after?.isReminderSent, false);
    assert.equal(after?.startTime.toISOString(), "2026-08-14T16:00:00.000Z");
  } finally {
    server.close();
  }
});
