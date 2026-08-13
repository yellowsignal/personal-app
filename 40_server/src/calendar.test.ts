import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "./app.js";
import { TaskStore } from "./store.js";
import { MemoryAuthRepository } from "./domain/memoryAuthRepository.js";
import { MemoryAssetRepository } from "./domain/memoryAssetRepository.js";
import { MemoryDocumentRepository } from "./domain/memoryDocumentRepository.js";
import { MemorySubscriptionRepository } from "./domain/memorySubscriptionRepository.js";
import { MemoryCalendarRepository } from "./domain/memoryCalendarRepository.js";
import { MemoryRecurringDepositRepository } from "./domain/memoryRecurringDepositRepository.js";
import { MemoryTransactionRepository } from "./domain/memoryTransactionRepository.js";
import { MemoryPasskeyRepository } from "./domain/memoryPasskeyRepository.js";
import { MemoryInviteTokenRepository } from "./domain/memoryInviteTokenRepository.js";
import { ChallengeStore } from "./auth/challengeStore.js";

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

async function registerOwner(base: string) {
  const res = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "cal-owner@example.com",
      password: "password123",
      name: "민호",
      familyName: "최가네",
    }),
  });
  assert.equal(res.status, 201);
  return (await res.json()) as { token: string };
}

test("calendar CRUD and derived document expiry / subscription billing", async () => {
  const app = createApp(tmpStore(), {
    authRepo: new MemoryAuthRepository(),
    assetRepo: new MemoryAssetRepository(),
    documentRepo: new MemoryDocumentRepository(),
    subscriptionRepo: new MemorySubscriptionRepository(),
    calendarRepo: new MemoryCalendarRepository(),
    recurringDepositRepo: new MemoryRecurringDepositRepository(),
    transactionRepo: new MemoryTransactionRepository(),
    passkeyRepo: new MemoryPasskeyRepository(),
    inviteTokenRepo: new MemoryInviteTokenRepository(),
    challengeStore: new ChallengeStore(),
    jwtSecret: "test-secret",
  });

  const { server, base } = await listen(app);
  try {
    const owner = await registerOwner(base);

    const createEvent = await fetch(`${base}/api/calendar/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        title: "치과",
        date: "2026-08-20",
        time: "14:00",
        category: "personal",
      }),
    });
    assert.equal(createEvent.status, 201);
    const created = (await createEvent.json()) as { id: string; title: string; time: string | null };
    assert.equal(created.title, "치과");
    assert.equal(created.time, "14:00");

    const docRes = await fetch(`${base}/api/documents`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        typeLabel: "여권",
        category: "id",
        fields: [{ label: "번호", value: "M123", isSecret: true }],
        expiryDate: "2026-08-25",
      }),
    });
    assert.equal(docRes.status, 201);

    const subRes = await fetch(`${base}/api/subscriptions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        serviceName: "Netflix",
        cost: 1500,
        currency: "JPY",
        billingInterval: "MONTHLY",
        billingDate: 15,
      }),
    });
    assert.equal(subRes.status, 201);

    const listRes = await fetch(
      `${base}/api/calendar/events?from=2026-08-01&to=2026-08-31&scope=all`,
      { headers: { authorization: `Bearer ${owner.token}` } },
    );
    assert.equal(listRes.status, 200);
    const events = (await listRes.json()) as Array<{ id: string; category: string; title: string; date: string }>;
    assert.ok(events.some((e) => e.title === "치과" && e.category === "personal"));
    assert.ok(events.some((e) => e.category === "document_expiry" && e.date === "2026-08-25"));
    assert.ok(events.some((e) => e.category === "subscription_billing" && e.date === "2026-08-15"));

    const del = await fetch(`${base}/api/calendar/events/${created.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(del.status, 204);

    const jpHolidays = await fetch(
      `${base}/api/calendar/events?from=2026-08-01&to=2026-08-31&scope=all`,
      { headers: { authorization: `Bearer ${owner.token}` } },
    );
    assert.equal(jpHolidays.status, 200);
    const jpEvents = (await jpHolidays.json()) as Array<{ category: string; date: string; title: string }>;
    assert.ok(jpEvents.some((e) => e.category === "holiday" && e.date === "2026-08-11"));
    assert.ok(!jpEvents.some((e) => e.category === "holiday" && e.date === "2026-08-15"));

    const patch = await fetch(`${base}/api/auth/me`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({ countryPref: "KR" }),
    });
    assert.equal(patch.status, 200);

    const krHolidays = await fetch(
      `${base}/api/calendar/events?from=2026-08-01&to=2026-08-31&scope=all`,
      { headers: { authorization: `Bearer ${owner.token}` } },
    );
    const krEvents = (await krHolidays.json()) as Array<{ category: string; date: string }>;
    assert.ok(krEvents.some((e) => e.category === "holiday" && e.date === "2026-08-15"));
    assert.ok(krEvents.some((e) => e.category === "holiday" && e.date === "2026-08-17"));
    assert.ok(!krEvents.some((e) => e.category === "holiday" && e.date === "2026-08-11"));

    const both = await fetch(`${base}/api/auth/me`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({ countryPref: "BOTH" }),
    });
    assert.equal(both.status, 200);
    const bothHolidays = await fetch(
      `${base}/api/calendar/events?from=2026-08-01&to=2026-08-31&scope=all`,
      { headers: { authorization: `Bearer ${owner.token}` } },
    );
    const bothEvents = (await bothHolidays.json()) as Array<{ category: string; date: string }>;
    assert.ok(bothEvents.some((e) => e.category === "holiday" && e.date === "2026-08-11"));
    assert.ok(bothEvents.some((e) => e.category === "holiday" && e.date === "2026-08-15"));
  } finally {
    server.close();
  }
});
