import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addUtcMonths,
  documentExpiryReminderDay,
  documentExpiryReminderEventTimes,
  documentExpiryReminderTitle,
} from "./documentExpiryReminder.js";

test("document expiry reminder is two months before expiry", () => {
  const expiry = new Date(Date.UTC(2026, 7, 15)); // Aug 15
  const day = documentExpiryReminderDay(expiry);
  assert.equal(day.toISOString().slice(0, 10), "2026-06-15");
  assert.equal(documentExpiryReminderTitle("운전면허증"), "운전면허증 · 만료 2개월 전");
});

test("addUtcMonths clamps end-of-month", () => {
  const mar31 = new Date(Date.UTC(2026, 2, 31));
  assert.equal(addUtcMonths(mar31, -2).toISOString().slice(0, 10), "2026-01-31");
});

test("reminder event is all-day with morning push", () => {
  const expiry = new Date(Date.UTC(2026, 11, 1));
  const times = documentExpiryReminderEventTimes(expiry);
  assert.equal(times.isAllDay, true);
  assert.equal(times.reminderMinutesBefore, 60);
  assert.equal(times.startTime.toISOString().slice(0, 10), "2026-10-01");
});
