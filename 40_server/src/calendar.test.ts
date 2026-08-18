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
        description: "예약 확인 후 보험증 지참",
      }),
    });
    assert.equal(createEvent.status, 201);
    const created = (await createEvent.json()) as {
      id: string;
      title: string;
      time: string | null;
      description: string | null;
      reminderMinutesBefore: number | null;
    };
    assert.equal(created.title, "치과");
    assert.equal(created.time, "14:00");
    assert.equal(created.description, "예약 확인 후 보험증 지참");
    assert.equal(created.reminderMinutesBefore, 60);

    const noReminder = await fetch(`${base}/api/calendar/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        title: "알림 없음",
        date: "2026-08-21",
        reminderMinutesBefore: null,
      }),
    });
    assert.equal(noReminder.status, 201);
    const noneEv = (await noReminder.json()) as { reminderMinutesBefore: number | null };
    assert.equal(noneEv.reminderMinutesBefore, null);

    const tenMin = await fetch(`${base}/api/calendar/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        title: "10분 전",
        date: "2026-08-22",
        time: "09:00",
        reminderMinutesBefore: 10,
      }),
    });
    assert.equal(tenMin.status, 201);
    const tenEv = (await tenMin.json()) as { reminderMinutesBefore: number | null };
    assert.equal(tenEv.reminderMinutesBefore, 10);

    const rangeRes = await fetch(`${base}/api/calendar/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        title: "육아휴직",
        date: "2026-08-17",
        endDate: "2026-08-22",
        category: "family",
        isShared: true,
      }),
    });
    assert.equal(rangeRes.status, 201);
    const ranged = (await rangeRes.json()) as { title: string; date: string; endDate: string };
    assert.equal(ranged.date, "2026-08-17");
    assert.equal(ranged.endDate, "2026-08-22");

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

    const juneRes = await fetch(
      `${base}/api/calendar/events?from=2026-06-01&to=2026-06-30&scope=all`,
      { headers: { authorization: `Bearer ${owner.token}` } },
    );
    assert.equal(juneRes.status, 200);
    const juneEvents = (await juneRes.json()) as Array<{
      category: string;
      date: string;
      title: string;
      reminderMinutesBefore: number | null;
      editable: boolean;
    }>;
    const preExpiry = juneEvents.find(
      (e) => e.category === "document_expiry" && e.date === "2026-06-25",
    );
    assert.ok(preExpiry, "expected expiry−2 months reminder event");
    assert.equal(preExpiry!.reminderMinutesBefore, 60);
    assert.equal(preExpiry!.editable, false);
    assert.match(preExpiry!.title, /만료 2개월 전/);

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

    const companyOn = await fetch(`${base}/api/auth/me`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({ companyHolidayPref: "KHI_AKASHI" }),
    });
    assert.equal(companyOn.status, 200);

    const companyHolidays = await fetch(
      `${base}/api/calendar/events?from=2026-08-01&to=2026-08-31&scope=all`,
      { headers: { authorization: `Bearer ${owner.token}` } },
    );
    const companyEvents = (await companyHolidays.json()) as Array<{
      category: string;
      date: string;
      title: string;
    }>;
    assert.ok(
      companyEvents.some((e) => e.category === "company" && e.date === "2026-08-13" && e.title === "하기휴가"),
    );
    assert.ok(companyEvents.some((e) => e.category === "holiday" && e.date === "2026-08-11"));
    assert.equal(companyEvents.filter((e) => e.date === "2026-08-11").length, 1);

    const culture = await fetch(`${base}/api/calendar/events?from=2026-11-01&to=2026-11-30&scope=all`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    const november = (await culture.json()) as Array<{ category: string; date: string; title: string }>;
    assert.equal(november.filter((e) => e.category === "holiday" && e.date === "2026-11-03").length, 1);
    assert.ok(november.some((e) => e.category === "company" && e.date === "2026-11-03" && e.title.includes("출근")));
    assert.ok(november.some((e) => e.category === "holiday" && e.date === "2026-11-23"));

    const nextFy = await fetch(`${base}/api/calendar/events?from=2027-04-01&to=2027-04-30&scope=all`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    const april2027 = (await nextFy.json()) as Array<{ category: string; date: string }>;
    assert.equal(april2027.filter((e) => e.category === "company").length, 0);
  } finally {
    server.close();
  }
});

test("calendar all-day recurring with long endDate expands as single-day occurrences", async () => {
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

    const createRes = await fetch(`${base}/api/calendar/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        title: "ダンボールごみ捨て",
        date: "2026-08-05",
        endDate: "2026-08-31",
        category: "family",
        isShared: true,
        recurrence: {
          freq: "MONTHLY",
          interval: 1,
          monthMode: "BY_NTH_WEEKDAY",
          byWeekday: [3],
          bySetPos: [1, 3],
        },
      }),
    });
    assert.equal(createRes.status, 201);
    const created = (await createRes.json()) as { date: string; endDate: string };
    assert.equal(created.date, "2026-08-05");
    assert.equal(created.endDate, "2026-08-05");

    const listRes = await fetch(
      `${base}/api/calendar/events?from=2026-08-01&to=2026-08-31&scope=all`,
      { headers: { authorization: `Bearer ${owner.token}` } },
    );
    const events = (await listRes.json()) as Array<{
      title: string;
      date: string;
      endDate: string;
    }>;
    const trash = events.filter((e) => e.title === "ダンボールごみ捨て");
    assert.deepEqual(
      trash.map((e) => e.date),
      ["2026-08-05", "2026-08-19"],
    );
    assert.ok(trash.every((e) => e.endDate === e.date));
  } finally {
    server.close();
  }
});

test("calendar recurring weekly events expand in range and delete as a series", async () => {
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

    const createRes = await fetch(`${base}/api/calendar/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        title: "영어 수업",
        date: "2026-08-10",
        time: "19:00",
        endTime: "20:00",
        category: "personal",
        recurrence: { freq: "WEEKLY", interval: 1, byWeekday: [1, 3], until: "2026-08-26" },
      }),
    });
    assert.equal(createRes.status, 201);
    const created = (await createRes.json()) as {
      id: string;
      seriesId: string;
      recurrence: { freq: string } | null;
    };
    assert.equal(created.recurrence?.freq, "WEEKLY");

    const listRes = await fetch(
      `${base}/api/calendar/events?from=2026-08-01&to=2026-08-31&scope=all`,
      { headers: { authorization: `Bearer ${owner.token}` } },
    );
    const events = (await listRes.json()) as Array<{ title: string; date: string; time: string | null; id: string }>;
    const lessons = events.filter((e) => e.title === "영어 수업");
    assert.deepEqual(
      lessons.map((e) => e.date),
      ["2026-08-10", "2026-08-12", "2026-08-17", "2026-08-19", "2026-08-24", "2026-08-26"],
    );
    assert.ok(lessons.every((e) => e.time === "19:00"));

    const later = await fetch(
      `${base}/api/calendar/events?from=2026-09-01&to=2026-09-30&scope=all`,
      { headers: { authorization: `Bearer ${owner.token}` } },
    );
    const september = (await later.json()) as Array<{ title: string }>;
    assert.equal(september.filter((e) => e.title === "영어 수업").length, 0);

    const del = await fetch(`${base}/api/calendar/events/${encodeURIComponent(lessons[2]!.id)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${owner.token}` } },
    );
    assert.equal(del.status, 204);

    const afterDel = await fetch(
      `${base}/api/calendar/events?from=2026-08-01&to=2026-08-31&scope=all`,
      { headers: { authorization: `Bearer ${owner.token}` } },
    );
    const remaining = (await afterDel.json()) as Array<{ title: string }>;
    assert.equal(remaining.filter((e) => e.title === "영어 수업").length, 0);
  } finally {
    server.close();
  }
});
