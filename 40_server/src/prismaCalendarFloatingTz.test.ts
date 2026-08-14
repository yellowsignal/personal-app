/**
 * Proves Prisma calendar DateTime round-trip under process TZ=Asia/Tokyo.
 * Skips when DATABASE_URL is unset (CI memory-only).
 *
 * Evidence: TIMESTAMP/TIMESTAMPTZ both preserve floating UTC components via Prisma Client;
 * a hypothetical "session TZ mis-read" of naive 14:00 as JST would shift to 05:00Z and
 * miss the afternoon due window — that path is NOT what Prisma does.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  isReminderDue,
  reminderFireAt,
  reminderLatestAt,
  toFloatingNow,
} from "./services/reminderDispatcher.js";
import { eventTimesFromRange } from "./domain/calendarTypes.js";

const databaseUrl = process.env.DATABASE_URL?.trim();

test("Prisma floating 14:00 survives Asia/Tokyo process TZ and is due at 13:46 JST", async (t) => {
  if (!databaseUrl) {
    t.skip("DATABASE_URL not set");
    return;
  }

  const prevTz = process.env.TZ;
  process.env.TZ = "Asia/Tokyo";
  const prisma = new PrismaClient();
  try {
    const inviteCode = `tz${Date.now().toString(36).slice(-8)}`;
    const family = await prisma.family.create({
      data: { familyName: "TZTest", inviteCode },
    });
    const user = await prisma.user.create({
      data: {
        email: `tz-${inviteCode}@example.com`,
        name: "TZ",
        passwordHash: await bcrypt.hash("x", 4),
        familyId: family.id,
        role: "OWNER",
        countryPref: "JP",
      },
    });

    const { startTime, endTime, isAllDay } = eventTimesFromRange("2026-08-14", null, "14:00", null);
    assert.equal(startTime.toISOString(), "2026-08-14T14:00:00.000Z");

    const created = await prisma.calendarEvent.create({
      data: {
        userId: user.id,
        familyId: family.id,
        title: "14:00 floating",
        startTime,
        endTime,
        isAllDay,
        category: "personal",
        reminderMinutesBefore: 60,
        isShared: false,
      },
    });

    const raw = await prisma.$queryRawUnsafe<Array<{ start_text: string; typ: string }>>(
      `SELECT start_time::text AS start_text, pg_typeof(start_time)::text AS typ FROM calendar_events WHERE id = $1`,
      created.id,
    );
    const read = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: created.id } });

    assert.match(raw[0]!.typ, /timestamp/i);
    assert.equal(read.startTime.toISOString(), "2026-08-14T14:00:00.000Z");
    assert.equal(read.reminderMinutesBefore, 60);

    const now = new Date("2026-08-14T04:46:00.000Z");
    const floatingNow = toFloatingNow(now, "Asia/Tokyo");
    const fireAt = reminderFireAt(read.startTime, 60, false);
    const latestAt = reminderLatestAt(read.startTime, read.endTime, false);
    assert.equal(floatingNow.toISOString(), "2026-08-14T13:46:00.000Z");
    assert.equal(isReminderDue(floatingNow, fireAt, latestAt), true);
    // Without floatingNow, raw UTC morning incorrectly looks "not yet due".
    assert.equal(isReminderDue(now, fireAt, latestAt), false);

    await prisma.calendarEvent.delete({ where: { id: created.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.family.delete({ where: { id: family.id } });
  } finally {
    await prisma.$disconnect();
    if (prevTz === undefined) delete process.env.TZ;
    else process.env.TZ = prevTz;
  }
});
