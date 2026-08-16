import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDateKey } from "../domain/calendarTypes.js";
import {
  APP_DISPLAY_NAME,
  formatCalendarReminderPayload,
  formatReminderClock,
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

test("formatReminderClock uses 오전/오후 and 午前/午後", () => {
  const afternoon = new Date("2026-08-14T15:00:00.000Z");
  assert.equal(formatReminderClock(afternoon, false, "ko"), "오후 3:00");
  assert.equal(formatReminderClock(afternoon, false, "ja"), "午後 3:00");
  const midnight = new Date("2026-08-14T00:05:00.000Z");
  assert.equal(formatReminderClock(midnight, false, "ko"), "오전 12:05");
  assert.equal(formatReminderClock(midnight, true, "ko"), "하루 종일");
  assert.equal(formatReminderClock(midnight, true, "ja"), "終日");
});

test("formatCalendarReminderPayload is event title / time · lead(+memo)", () => {
  const start = new Date("2026-08-14T07:13:00.000Z");
  const withMemo = formatCalendarReminderPayload({
    eventTitle: "테스트",
    description: "메모 내용",
    start,
    isAllDay: false,
    languagePref: "ko",
    reminderMinutesBefore: 10,
  });
  assert.equal(withMemo.title, "테스트");
  assert.equal(withMemo.body, "오전 7:13 · 10분 전 메모 내용");

  const noMemo = formatCalendarReminderPayload({
    eventTitle: "테스트",
    description: "  ",
    start,
    isAllDay: false,
    languagePref: "ko",
    reminderMinutesBefore: 60,
  });
  assert.equal(noMemo.title, "테스트");
  assert.equal(noMemo.body, "오전 7:13 · 1시간 전");

  const emptyTitle = formatCalendarReminderPayload({
    eventTitle: "  ",
    description: null,
    start,
    isAllDay: true,
    languagePref: "ko",
    reminderMinutesBefore: 1440,
  });
  assert.equal(emptyTitle.title, APP_DISPLAY_NAME);
  assert.equal(emptyTitle.body, "하루 종일 · 1일 전");

  const ja = formatCalendarReminderPayload({
    eventTitle: "会議",
    description: null,
    start: new Date("2026-08-14T15:00:00.000Z"),
    isAllDay: false,
    languagePref: "ja",
    reminderMinutesBefore: 30,
  });
  assert.equal(ja.body, "午後 3:00 · 30分前");
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
