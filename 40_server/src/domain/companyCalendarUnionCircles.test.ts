import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { offDatesFromCircledGrid, type CircleMark } from "./companyCalendarUnionCircles.js";
import { KHI_AKASHI_FY2026_OFF_DATES } from "./khiAkashiFy2026OffDates.js";

test("circled-grid mapper reconstructs FY2026 Akashi off dates", () => {
  let circles: CircleMark[] = [];
  let height = 842;
  try {
    const raw = JSON.parse(readFileSync("/tmp/khi-cal/union-circles.json", "utf8")) as {
      height: number;
      circles: CircleMark[];
    };
    circles = raw.circles;
    height = raw.height;
  } catch {
    return;
  }
  const off = offDatesFromCircledGrid(circles, 2026, height);
  assert.deepEqual(off, [...KHI_AKASHI_FY2026_OFF_DATES]);
});
