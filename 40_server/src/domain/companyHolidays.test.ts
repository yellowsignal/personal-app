import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCompanyHolidayPref, companyOffTitle, offDatesForFiscalYear, fiscalYearRange } from "./companyHolidays.js";
import { overlayCompanyCalendar } from "./companyCalendarOverlay.js";
import { listPublicHolidays } from "./holidays.js";
import { KHI_AKASHI_FY2026_OFF_DATES } from "./khiAkashiFy2026OffDates.js";

test("parseCompanyHolidayPref defaults to NONE", () => {
  assert.equal(parseCompanyHolidayPref(undefined), "NONE");
  assert.equal(parseCompanyHolidayPref("khi_akashi"), "KHI_AKASHI");
  assert.equal(parseCompanyHolidayPref("nope"), "NONE");
});

test("overlay treats weekday company closures as a separate company category", () => {
  const national = listPublicHolidays("2026-08-01", "2026-08-31", ["JP"]);
  const overlay = overlayCompanyCalendar({
    national,
    offDates: new Set(KHI_AKASHI_FY2026_OFF_DATES),
    cal: "KHI_AKASHI",
    fromKey: "2026-08-01",
    toKey: "2026-08-31",
  });
  assert.ok(overlay.national.some((h) => h.date === "2026-08-11"));
  assert.equal(
    overlay.company.filter((e) => e.date === "2026-08-11").length,
    0,
    "山の日 stays a national holiday, not duplicated as company",
  );
  const summer = overlay.company.filter((e) => e.kind === "off").map((e) => e.date);
  assert.deepEqual(summer, ["2026-08-10", "2026-08-12", "2026-08-13", "2026-08-14"]);
  assert.equal(overlay.company.find((e) => e.date === "2026-08-13")?.name.ko, "하기휴가");
});

test("JP national holidays that are company workdays stay as 祝日 and add 출근", () => {
  const national = listPublicHolidays("2026-11-01", "2026-11-30", ["JP"]);
  assert.ok(national.some((h) => h.date === "2026-11-03"));
  const overlay = overlayCompanyCalendar({
    national,
    offDates: new Set(KHI_AKASHI_FY2026_OFF_DATES),
    cal: "KHI_AKASHI",
    fromKey: "2026-11-01",
    toKey: "2026-11-30",
  });
  assert.equal(overlay.national.filter((h) => h.date === "2026-11-03").length, 1);
  const work = overlay.company.find((e) => e.date === "2026-11-03");
  assert.equal(work?.kind, "work");
  assert.match(work?.name.ja ?? "", /出勤/);
  assert.ok(overlay.national.some((h) => h.date === "2026-11-23"));
});

test("KR holidays are not suppressed by the company calendar", () => {
  const national = listPublicHolidays("2026-08-01", "2026-08-31", ["KR", "JP"]);
  const overlay = overlayCompanyCalendar({
    national,
    offDates: new Set(KHI_AKASHI_FY2026_OFF_DATES),
    cal: "KHI_AKASHI",
    fromKey: "2026-08-01",
    toKey: "2026-08-31",
  });
  assert.ok(overlay.national.some((h) => h.country === "KR" && h.date === "2026-08-15"));
});

test("overlay is empty when company calendar is off", () => {
  const national = listPublicHolidays("2026-08-01", "2026-08-31", ["JP"]);
  const overlay = overlayCompanyCalendar({
    national,
    offDates: new Set(KHI_AKASHI_FY2026_OFF_DATES),
    cal: "NONE",
    fromKey: "2026-08-01",
    toKey: "2026-08-31",
  });
  assert.equal(overlay.company.length, 0);
  assert.equal(overlay.national.length, national.length);
});

test("named ranges cover GW and year-end extras", () => {
  assert.equal(companyOffTitle("2026-04-30").name.ja, "GW休業");
  assert.equal(companyOffTitle("2027-01-04").code, "year-end");
  assert.equal(companyOffTitle("2026-11-23").code, "company");
});

test("registered off dates apply only to that April–March fiscal year", () => {
  assert.deepEqual(fiscalYearRange(2026), { from: "2026-04-01", to: "2027-03-31" });
  const stored = ["2026-08-13", "2027-01-04", "2027-04-05"];
  const fy2026 = offDatesForFiscalYear({
    pref: "KHI_AKASHI",
    storedYear: 2026,
    storedDates: stored,
    rangeFrom: "2026-08-01",
  });
  assert.ok(fy2026?.has("2026-08-13"));
  assert.ok(fy2026?.has("2027-01-04"));
  assert.equal(fy2026?.has("2027-04-05"), false);
  const fy2027 = offDatesForFiscalYear({
    pref: "KHI_AKASHI",
    storedYear: 2026,
    storedDates: stored,
    rangeFrom: "2027-04-01",
  });
  assert.equal(fy2027, null);
});
