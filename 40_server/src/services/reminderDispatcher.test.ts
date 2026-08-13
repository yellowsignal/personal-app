import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDateKey } from "../domain/calendarTypes.js";
import { isReminderDue, reminderFireAt, reminderLatestAt } from "./reminderDispatcher.js";

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
