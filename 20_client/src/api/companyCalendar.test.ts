import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultCompanyCalendarUrl, japanFiscalYear } from "./companyCalendar.ts";

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
