import assert from "node:assert/strict";
import { test } from "node:test";
import { listCompanyHolidays, parseCompanyHolidayPref } from "./companyHolidays.js";
import { listPublicHolidays } from "./holidays.js";

test("parseCompanyHolidayPref defaults to NONE", () => {
  assert.equal(parseCompanyHolidayPref(undefined), "NONE");
  assert.equal(parseCompanyHolidayPref("khi_akashi"), "KHI_AKASHI");
  assert.equal(parseCompanyHolidayPref("nope"), "NONE");
});

test("KHI Akashi extras skip weekends and overlapping JP national holidays", () => {
  const extras = listCompanyHolidays("2026-04-01", "2027-03-31", "KHI_AKASHI");
  const dates = extras.map((h) => h.date);
  assert.deepEqual(dates, [
    "2026-04-30",
    "2026-05-01",
    "2026-07-21",
    "2026-07-22",
    "2026-08-10",
    "2026-08-12",
    "2026-08-13",
    "2026-08-14",
    "2026-12-28",
    "2026-12-29",
    "2026-12-30",
    "2026-12-31",
  ]);
  const jp = new Set(listPublicHolidays("2026-04-01", "2027-03-31", ["JP"]).map((h) => h.date));
  for (const d of dates) {
    assert.equal(jp.has(d), false, `${d} should not already be a JP national holiday`);
  }
  assert.equal(extras.find((h) => h.date === "2026-07-21")?.name.ja, "電力休暇");
  assert.equal(extras.find((h) => h.date === "2026-08-13")?.name.ko, "하기휴가");
});

test("listCompanyHolidays is empty when disabled", () => {
  assert.equal(listCompanyHolidays("2026-01-01", "2026-12-31", "NONE").length, 0);
});
