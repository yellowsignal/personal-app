import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDateKey } from "../domain/calendarTypes.js";
import {
  isReminderDue,
  reminderFireAt,
  reminderLatestAt,
  timeZoneFromCountryPref,
  toFloatingNow,
} from "./reminderDispatcher.js";

test("timed reminder fires minutes before start", () => {
  const start = new Date("2026-08-14T15:00:00.000Z");
  const fire = reminderFireAt(start, 60, false);
  assert.equal(fire.toISOString(), "2026-08-14T14:00:00.000Z");
});

test("all-day reminder anchors to morning instead of previous UTC night", () => {
  const start = parseDateKey("2026-08-14");
  const fire1h = reminderFireAt(start, 60, true);
  assert.equal(fire1h.toISOString(), "2026-08-14T08:00:00.000Z");
  const fire1d = reminderFireAt(start, 1440, true);
  assert.equal(fire1d.toISOString(), "2026-08-13T09:00:00.000Z");
});

test("catch-up keeps all-day reminder due through end of day", () => {
  const start = parseDateKey("2026-08-14");
  const end = new Date(start);
  end.setUTCHours(23, 59, 59, 999);
  const fireAt = reminderFireAt(start, 60, true);
  const latest = reminderLatestAt(start, end, true);
  assert.equal(isReminderDue(new Date("2026-08-14T15:00:00.000Z"), fireAt, latest), true);
  assert.equal(isReminderDue(new Date("2026-08-15T01:00:00.000Z"), fireAt, latest), false);
});

test("country pref maps to Seoul or Tokyo", () => {
  assert.equal(timeZoneFromCountryPref("KR"), "Asia/Seoul");
  assert.equal(timeZoneFromCountryPref("JP"), "Asia/Tokyo");
  assert.equal(timeZoneFromCountryPref("BOTH"), "Asia/Tokyo");
  assert.equal(timeZoneFromCountryPref(undefined), "Asia/Tokyo");
});

test("toFloatingNow projects UTC instant onto Asia/Tokyo wall clock", () => {
  // 05:00 UTC = 14:00 JST on the same calendar date
  const floating = toFloatingNow(new Date("2026-08-14T05:00:00.000Z"), "Asia/Tokyo");
  assert.equal(floating.toISOString(), "2026-08-14T14:00:00.000Z");
});

test("JST wall-clock 14:00 makes floating 15:00 event with 1h reminder due", () => {
  const start = new Date("2026-08-14T15:00:00.000Z");
  const fireAt = reminderFireAt(start, 60, false);
  const latestAt = reminderLatestAt(start, new Date(start.getTime() + 3600_000), false);
  const realUtcMorning = new Date("2026-08-14T05:00:00.000Z"); // 14:00 JST
  const floatingNow = toFloatingNow(realUtcMorning, "Asia/Tokyo");
  assert.equal(floatingNow.toISOString(), "2026-08-14T14:00:00.000Z");
  assert.equal(isReminderDue(floatingNow, fireAt, latestAt), true);
  // Without floating conversion, raw UTC 05:00 would incorrectly be before fireAt 14:00
  assert.equal(isReminderDue(realUtcMorning, fireAt, latestAt), false);
});

test("simulated Prisma TIMESTAMP WITHOUT TZ +9 shift misses timed 1h catch-up at local 14:00", () => {
  const stored = new Date("2026-08-14T15:00:00.000Z");
  // Session Asia/Tokyo: 15:00Z → 00:00 next local day, Prisma reads naive as UTC.
  const afterRoundTrip = toFloatingNow(stored, "Asia/Tokyo");
  assert.equal(afterRoundTrip.toISOString(), "2026-08-15T00:00:00.000Z");
  const fireAt = reminderFireAt(afterRoundTrip, 60, false);
  const latestAt = reminderLatestAt(afterRoundTrip, new Date(afterRoundTrip.getTime() + 3600_000), false);
  const floating14 = toFloatingNow(new Date("2026-08-14T05:00:00.000Z"), "Asia/Seoul");
  assert.equal(floating14.toISOString(), "2026-08-14T14:00:00.000Z");
  assert.equal(isReminderDue(floating14, fireAt, latestAt), false);
});

test("UI-default all-day 1h reminder is due at 11:20 KST", () => {
  const start = parseDateKey("2026-08-14");
  const end = new Date(start);
  end.setUTCHours(23, 59, 59, 999);
  const fireAt = reminderFireAt(start, 60, true);
  const latest = reminderLatestAt(start, end, true);
  const floatingNow = toFloatingNow(new Date("2026-08-14T02:20:00.000Z"), "Asia/Seoul");
  assert.equal(floatingNow.toISOString(), "2026-08-14T11:20:00.000Z");
  assert.equal(isReminderDue(floatingNow, fireAt, latest), true);
});
