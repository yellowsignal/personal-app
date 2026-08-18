import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultCompanyCalendarUrl, fiscalYearRange, japanFiscalYear } from "./companyCalendar.ts";

test("japanFiscalYear is April-start", () => {
  assert.equal(japanFiscalYear(new Date(2026, 7, 18)), 2026);
  assert.equal(japanFiscalYear(new Date(2026, 2, 1)), 2025);
});

test("defaultCompanyCalendarUrl fills the union Akashi PDF path", () => {
  assert.equal(
    defaultCompanyCalendarUrl(2026),
    "https://www.khiunion.or.jp/wp-content/themes/kawasakijukou/pdf/calendar/2026/09_2026-akashi-A.pdf",
  );
});

test("fiscalYearRange is April through next March", () => {
  assert.deepEqual(fiscalYearRange(2026), { from: "2026-04-01", to: "2027-03-31" });
});
