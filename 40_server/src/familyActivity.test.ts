import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "./app.js";
import { TaskStore } from "./store.js";
import { MemoryAuthRepository } from "./domain/memoryAuthRepository.js";
import { MemoryCalendarRepository } from "./domain/memoryCalendarRepository.js";
import { MemoryFamilyActivityRepository } from "./domain/memoryFamilyActivityRepository.js";
import type { FamilyActivityRepository } from "./domain/familyActivityTypes.js";
import { MemoryPushRepository } from "./domain/memoryPushRepository.js";
import { ChallengeStore } from "./auth/challengeStore.js";
import { MemoryPasskeyRepository } from "./domain/memoryPasskeyRepository.js";
import { MemoryInviteTokenRepository } from "./domain/memoryInviteTokenRepository.js";
import { PushService, type PushPayload } from "./services/pushService.js";

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

test("shared calendar create notifies family activity feed and push", async () => {
  const authRepo = new MemoryAuthRepository();
  const calendarRepo = new MemoryCalendarRepository();
  const activityRepo = new MemoryFamilyActivityRepository();
  const pushRepo = new MemoryPushRepository();
  const delivered: PushPayload[] = [];
  const pushService = new PushService(
    pushRepo,
    { publicKey: "pub", privateKey: "priv", subject: "mailto:test@example.com" },
    {
      async send(_sub, payload) {
        delivered.push(payload);
        return "ok";
      },
    },
  );

  const app = createApp(tmpStore(), {
    authRepo,
    calendarRepo,
    activityRepo,
    pushService,
    passkeyRepo: new MemoryPasskeyRepository(),
    inviteTokenRepo: new MemoryInviteTokenRepository(),
    challengeStore: new ChallengeStore(),
    jwtSecret: "test-secret",
  });

  const { server, base } = await listen(app);
  try {
    const ownerRes = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "activity-owner@example.com",
        password: "password123",
        name: "민호",
        familyName: "최가네",
      }),
    });
    assert.equal(ownerRes.status, 201);
    const owner = (await ownerRes.json()) as { token: string; user: { id: number; familyId: number } };

    const family = await fetch(`${base}/api/family`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    const familyBody = (await family.json()) as { inviteCode: string };

    const memberRes = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "activity-member@example.com",
        password: "password123",
        name: "아내",
        inviteCode: familyBody.inviteCode,
      }),
    });
    assert.equal(memberRes.status, 201);
    const member = (await memberRes.json()) as { token: string; user: { id: number } };

    await fetch(`${base}/api/push/subscribe`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${member.token}`,
      },
      body: JSON.stringify({
        endpoint: "https://push.example/member-1",
        keys: { p256dh: "p256", auth: "auth-token" },
      }),
    });

    const created = await fetch(`${base}/api/calendar/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        title: "가족 여행",
        date: "2026-09-01",
        category: "family",
        isShared: true,
        reminderMinutesBefore: null,
      }),
    });
    assert.equal(created.status, 201);

    const summary = await fetch(`${base}/api/family/activity/summary`, {
      headers: { authorization: `Bearer ${member.token}` },
    });
    assert.equal(summary.status, 200);
    const summaryBody = (await summary.json()) as {
      unreadCount: number;
      latest: {
        title: string;
        actorName: string;
        action: string;
        summary: string;
      } | null;
    };
    assert.equal(summaryBody.unreadCount, 1);
    assert.equal(summaryBody.latest?.title, "가족 여행");
    assert.equal(summaryBody.latest?.actorName, "민호");
    assert.equal(summaryBody.latest?.action, "CREATED");
    assert.match(summaryBody.latest?.summary ?? "", /등록/);

    assert.ok(delivered.length >= 1);
    assert.equal(delivered[0]?.unreadCount, 1);
    assert.match(delivered[0]?.body ?? "", /등록/);

    const events = await fetch(`${base}/api/calendar/events?from=2026-09-01&to=2026-09-30&scope=all`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(events.status, 200);
    const eventList = (await events.json()) as Array<{ id: string; title: string }>;
    const trip = eventList.find((e) => e.title === "가족 여행");
    assert.ok(trip);

    delivered.length = 0;
    const updated = await fetch(`${base}/api/calendar/events/${trip!.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({ date: "2026-09-10" }),
    });
    assert.equal(updated.status, 200);

    const listAfter = await fetch(`${base}/api/family/activity?limit=10`, {
      headers: { authorization: `Bearer ${member.token}` },
    });
    assert.equal(listAfter.status, 200);
    const activities = (await listAfter.json()) as Array<{
      action: string;
      summary: string;
      title: string;
    }>;
    const dateChange = activities.find((a) => a.action === "UPDATED" && a.title === "가족 여행");
    assert.ok(dateChange);
    assert.match(dateChange!.summary, /2026-09-01/);
    assert.match(dateChange!.summary, /2026-09-10/);
    assert.ok(delivered.length >= 1);
    assert.match(delivered[0]?.body ?? "", /2026-09-10/);

    const read = await fetch(`${base}/api/family/activity/read`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${member.token}`,
      },
      body: JSON.stringify({ all: true }),
    });
    assert.equal(read.status, 200);
    const readBody = (await read.json()) as { unreadCount: number };
    assert.equal(readBody.unreadCount, 0);
  } finally {
    server.close();
  }
});

test("shared calendar create still returns 201 when activityRepo.create throws", async () => {
  const authRepo = new MemoryAuthRepository();
  const calendarRepo = new MemoryCalendarRepository();
  const activityRepo: FamilyActivityRepository = {
    async create() {
      throw new Error("simulated family_activity insert failure");
    },
    async listForFamily() {
      return [];
    },
    async countUnreadForUser() {
      return 0;
    },
    async listUnreadIdsForUser() {
      return [];
    },
    async markRead() {},
    async markAllRead() {},
  };

  const app = createApp(tmpStore(), {
    authRepo,
    calendarRepo,
    activityRepo,
    passkeyRepo: new MemoryPasskeyRepository(),
    inviteTokenRepo: new MemoryInviteTokenRepository(),
    challengeStore: new ChallengeStore(),
    jwtSecret: "test-secret",
  });

  const { server, base } = await listen(app);
  try {
    const ownerRes = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "activity-fail-owner@example.com",
        password: "password123",
        name: "민호",
        familyName: "최가네",
      }),
    });
    assert.equal(ownerRes.status, 201);
    const owner = (await ownerRes.json()) as { token: string };

    const created = await fetch(`${base}/api/calendar/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        title: "공유 일정",
        date: "2026-09-02",
        time: "15:00",
        category: "family",
        isShared: true,
        reminderMinutesBefore: 60,
      }),
    });
    assert.equal(created.status, 201);
    const body = (await created.json()) as { id: string; title: string; isShared: boolean };
    assert.equal(body.title, "공유 일정");
    assert.equal(body.isShared, true);

    const list = await fetch(`${base}/api/calendar/events?from=2026-09-01&to=2026-09-30&scope=all`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(list.status, 200);
    const items = (await list.json()) as Array<{ title: string }>;
    assert.ok(items.some((e) => e.title === "공유 일정"));
  } finally {
    server.close();
  }
});
