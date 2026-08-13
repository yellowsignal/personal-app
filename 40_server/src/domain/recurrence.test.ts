import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDateKey, toDateKey } from "./calendarTypes.js";
import {
  expandRecurrence,
  inferBySetPos,
  normalizeRecurrence,
  nthWeekdayInMonth,
  occurrenceEndTime,
  parseRecurrence,
} from "./recurrence.js";

test("parseRecurrence rejects invalid freq and clamps fields", () => {
  assert.equal(parseRecurrence(null), null);
  assert.equal(parseRecurrence({ freq: "HOURLY", interval: 1 }), null);
  assert.equal(parseRecurrence({ freq: "DAILY", interval: 0 }), null);
  const rule = parseRecurrence({
    freq: "weekly",
    interval: 2,
    byWeekday: [1, 1, 3, 9],
    until: "2026-12-31",
    count: 12,
  });
  assert.deepEqual(rule, {
    freq: "WEEKLY",
    interval: 2,
    byWeekday: [1, 3],
    until: "2026-12-31",
    count: 12,
  });
});

test("daily every 2 days respects until", () => {
  const start = parseDateKey("2026-08-13");
  const dates = expandRecurrence(
    { freq: "DAILY", interval: 2, until: "2026-08-21" },
    start,
    parseDateKey("2026-08-01"),
    parseDateKey("2026-08-31"),
  ).map(toDateKey);
  assert.deepEqual(dates, ["2026-08-13", "2026-08-15", "2026-08-17", "2026-08-19", "2026-08-21"]);
});

test("weekdays Mon-Fri in a week", () => {
  const start = parseDateKey("2026-08-13"); // Thursday
  const dates = expandRecurrence(
    { freq: "WEEKLY", interval: 1, byWeekday: [1, 2, 3, 4, 5] },
    start,
    parseDateKey("2026-08-13"),
    parseDateKey("2026-08-21"),
  ).map(toDateKey);
  assert.deepEqual(dates, ["2026-08-13", "2026-08-14", "2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21"]);
});

test("weekly interval 2 on Mon and Wed", () => {
  const start = parseDateKey("2026-08-10"); // Monday
  const dates = expandRecurrence(
    { freq: "WEEKLY", interval: 2, byWeekday: [1, 3] },
    start,
    parseDateKey("2026-08-01"),
    parseDateKey("2026-08-31"),
  ).map(toDateKey);
  assert.deepEqual(dates, ["2026-08-10", "2026-08-12", "2026-08-24", "2026-08-26"]);
});

test("monthly by month day clamps to end of short months", () => {
  const start = parseDateKey("2026-01-31");
  const dates = expandRecurrence(
    { freq: "MONTHLY", interval: 1, monthMode: "BY_MONTHDAY", count: 3 },
    start,
    parseDateKey("2026-01-01"),
    parseDateKey("2026-03-31"),
  ).map(toDateKey);
  assert.deepEqual(dates, ["2026-01-31", "2026-02-28", "2026-03-31"]);
});

test("monthly nth weekday uses last Thursday", () => {
  const start = parseDateKey("2026-08-27"); // last Thursday of August 2026
  assert.equal(inferBySetPos(start), -1);
  const last = nthWeekdayInMonth(2026, 8, 4, -1);
  assert.equal(last && toDateKey(last), "2026-09-24");
  const dates = expandRecurrence(
    { freq: "MONTHLY", interval: 1, monthMode: "BY_NTH_WEEKDAY", byWeekday: [4], bySetPos: -1, count: 3 },
    start,
    parseDateKey("2026-08-01"),
    parseDateKey("2026-10-31"),
  ).map(toDateKey);
  assert.deepEqual(dates, ["2026-08-27", "2026-09-24", "2026-10-29"]);
});

test("monthly 1st and 3rd Wednesday expands both days", () => {
  // 2026-08: Wed 5 (1st), Wed 19 (3rd)
  const start = parseDateKey("2026-08-05");
  const dates = expandRecurrence(
    {
      freq: "MONTHLY",
      interval: 1,
      monthMode: "BY_NTH_WEEKDAY",
      byWeekday: [3],
      bySetPos: [1, 3],
      count: 4,
    },
    start,
    parseDateKey("2026-08-01"),
    parseDateKey("2026-09-30"),
  ).map(toDateKey);
  assert.deepEqual(dates, ["2026-08-05", "2026-08-19", "2026-09-02", "2026-09-16"]);
});

test("occurrenceEndTime clamps all-day recurring to the occurrence day", () => {
  const from = parseDateKey("2026-08-05");
  const to = parseDateKey("2026-08-19");
  const masterEnd = parseDateKey("2026-08-31");
  masterEnd.setUTCHours(23, 59, 59, 999);
  const end = occurrenceEndTime(masterEnd, true, from, to);
  assert.equal(toDateKey(end), "2026-08-19");
  assert.equal(end.getUTCHours(), 23);
});

test("yearly and count stop expansion", () => {
  const start = parseDateKey("2024-02-29");
  const dates = expandRecurrence(
    { freq: "YEARLY", interval: 1, count: 3 },
    start,
    parseDateKey("2024-01-01"),
    parseDateKey("2028-12-31"),
  ).map(toDateKey);
  assert.deepEqual(dates, ["2024-02-29", "2025-02-28", "2026-02-28"]);
});

test("normalizeRecurrence fills weekly weekday from start", () => {
  const rule = normalizeRecurrence({ freq: "WEEKLY", interval: 1 }, parseDateKey("2026-08-13"));
  assert.deepEqual(rule?.byWeekday, [4]);
});
