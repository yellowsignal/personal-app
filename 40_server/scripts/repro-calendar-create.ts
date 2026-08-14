/**
 * MEMORY_AUTH calendar CREATE repro — boots in-process memory app (no Postgres),
 * registers a user, POSTs several /api/calendar/events payloads, prints status/body.
 *
 * Usage (from repo root or 40_server):
 *   npx tsx 40_server/scripts/repro-calendar-create.ts
 *
 * Optional: hit an already-running server instead:
 *   BASE_URL=http://127.0.0.1:3001 npx tsx 40_server/scripts/repro-calendar-create.ts
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.js";
import { TaskStore } from "../src/store.js";
import { MemoryAuthRepository } from "../src/domain/memoryAuthRepository.js";
import { MemoryAssetRepository } from "../src/domain/memoryAssetRepository.js";
import { MemoryDocumentRepository } from "../src/domain/memoryDocumentRepository.js";
import { MemorySubscriptionRepository } from "../src/domain/memorySubscriptionRepository.js";
import { MemoryCalendarRepository } from "../src/domain/memoryCalendarRepository.js";
import { MemoryRecurringDepositRepository } from "../src/domain/memoryRecurringDepositRepository.js";
import { MemoryTransactionRepository } from "../src/domain/memoryTransactionRepository.js";
import { MemoryPasskeyRepository } from "../src/domain/memoryPasskeyRepository.js";
import { MemoryInviteTokenRepository } from "../src/domain/memoryInviteTokenRepository.js";
import { MemoryFamilyActivityRepository } from "../src/domain/memoryFamilyActivityRepository.js";
import { ChallengeStore } from "../src/auth/challengeStore.js";

type Case = { name: string; body: Record<string, unknown> };

async function listen(app: ReturnType<typeof createApp>) {
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("expected TCP address");
  return { server, base: `http://127.0.0.1:${address.port}` };
}

async function register(base: string) {
  const res = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `cal-repro-${Date.now()}@example.com`,
      password: "password123",
      name: "Repro",
      familyName: "ReproFamily",
    }),
  });
  const text = await res.text();
  console.log(`[register] ${res.status} ${text.slice(0, 200)}`);
  if (!res.ok) throw new Error(`register failed: ${res.status}`);
  return JSON.parse(text) as { token: string };
}

async function postEvent(base: string, token: string, name: string, body: Record<string, unknown>) {
  const res = await fetch(`${base}/api/calendar/events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep raw */
  }
  console.log(`\n=== ${name} ===`);
  console.log(`status: ${res.status}`);
  console.log(`body: ${JSON.stringify(parsed, null, 2)}`);
  return { status: res.status, body: parsed };
}

async function listEvents(base: string, token: string, from: string, to: string) {
  const res = await fetch(`${base}/api/calendar/events?from=${from}&to=${to}&scope=all`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep raw */
  }
  const count = Array.isArray(parsed) ? parsed.length : -1;
  console.log(`\n=== LIST ${from}..${to} ===`);
  console.log(`status: ${res.status} count: ${count}`);
  if (Array.isArray(parsed)) {
    for (const ev of parsed.slice(0, 20)) {
      const e = ev as { id: string; title: string; date: string; category: string };
      console.log(`  - ${e.id} ${e.date} [${e.category}] ${e.title}`);
    }
  } else {
    console.log(`body: ${text.slice(0, 400)}`);
  }
  return { status: res.status, body: parsed };
}

async function main() {
  const external = process.env.BASE_URL?.replace(/\/$/, "");
  let server: { close: (cb?: () => void) => void } | null = null;
  let base = external ?? "";

  if (!external) {
    const app = createApp(new TaskStore(join(mkdtempSync(join(tmpdir(), "cal-repro-")), "tasks.json")), {
      authRepo: new MemoryAuthRepository(),
      assetRepo: new MemoryAssetRepository(),
      documentRepo: new MemoryDocumentRepository(),
      subscriptionRepo: new MemorySubscriptionRepository(),
      calendarRepo: new MemoryCalendarRepository(),
      recurringDepositRepo: new MemoryRecurringDepositRepository(),
      transactionRepo: new MemoryTransactionRepository(),
      passkeyRepo: new MemoryPasskeyRepository(),
      inviteTokenRepo: new MemoryInviteTokenRepository(),
      activityRepo: new MemoryFamilyActivityRepository(),
      challengeStore: new ChallengeStore(),
      jwtSecret: "repro-secret",
    });
    const listened = await listen(app);
    server = listened.server;
    base = listened.base;
    console.log(`[repro] in-process MEMORY app at ${base}`);
  } else {
    console.log(`[repro] using BASE_URL=${base}`);
  }

  try {
    const { token } = await register(base);

    const cases: Case[] = [
      {
        name: "minimal timed (client-like default reminder 60)",
        body: {
          title: "치과",
          date: "2026-08-20",
          time: "14:00",
          endTime: null,
          endDate: "2026-08-20",
          isAllDay: false,
          category: "personal",
          isShared: false,
          recurrence: null,
          reminderMinutesBefore: 60,
          description: null,
        },
      },
      {
        name: "all-day personal reminder none",
        body: {
          title: "종일",
          date: "2026-08-21",
          endDate: "2026-08-21",
          time: null,
          endTime: null,
          isAllDay: true,
          category: "personal",
          isShared: false,
          recurrence: null,
          reminderMinutesBefore: null,
        },
      },
      {
        name: "family shared (activity path)",
        body: {
          title: "가족 모임",
          date: "2026-08-22",
          endDate: "2026-08-22",
          time: "18:00",
          endTime: "20:00",
          category: "family",
          isShared: true,
          recurrence: null,
          reminderMinutesBefore: 60,
        },
      },
      {
        name: "weekly recurrence",
        body: {
          title: "주간 회의",
          date: "2026-08-17",
          endDate: "2026-08-17",
          time: "10:00",
          category: "personal",
          isShared: false,
          recurrence: { freq: "WEEKLY", interval: 1, byWeekday: [1], until: "2026-09-30" },
          reminderMinutesBefore: 10,
        },
      },
      {
        name: "invalid reminder (expect 400)",
        body: {
          title: "bad reminder",
          date: "2026-08-23",
          reminderMinutesBefore: 15,
        },
      },
    ];

    const results: Array<{ name: string; status: number }> = [];
    for (const c of cases) {
      const r = await postEvent(base, token, c.name, c.body);
      results.push({ name: c.name, status: r.status });
    }

    await listEvents(base, token, "2026-08-01", "2026-08-31");

    console.log("\n=== SUMMARY ===");
    for (const r of results) {
      console.log(`${r.status}\t${r.name}`);
    }
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
