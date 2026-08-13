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
import { ReminderDispatcher } from "./services/reminderDispatcher.js";

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

    const start = new Date(Date.now() + 5 * 60 * 1000);
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
