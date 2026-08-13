import assert from "node:assert/strict";
import { test } from "node:test";
import { holidayTitle, listPublicHolidays } from "./holidays.js";

function dates(country: "KR" | "JP", from: string, to: string) {
  return listPublicHolidays(from, to, [country]).map((h) => `${h.date}:${h.code}`);
}

test("Japan 2026 holidays include Golden Week substitute and Citizens' Day", () => {
  const items = listPublicHolidays("2026-01-01", "2026-12-31", ["JP"]);
  const byDate = new Map(items.map((h) => [h.date, h]));
  assert.equal(byDate.get("2026-01-12")?.code, "coming-of-age");
  assert.equal(byDate.get("2026-05-03")?.code, "constitution");
  assert.equal(byDate.get("2026-05-06")?.code, "constitution-obs");
  assert.equal(byDate.get("2026-07-20")?.code, "marine");
  assert.equal(byDate.get("2026-08-11")?.code, "mountain");
  assert.equal(byDate.get("2026-09-21")?.code, "respect-aged");
  assert.equal(byDate.get("2026-09-22")?.code, "citizens-2026-09-22");
  assert.equal(byDate.get("2026-09-23")?.code, "autumnal");
  assert.equal(holidayTitle(byDate.get("2026-08-11")!, "ko"), "산의 날");
  assert.equal(holidayTitle(byDate.get("2026-08-11")!, "ja"), "山の日");
});

test("Korea 2026 holidays include Seollal, substitutes, Labor Day and Constitution Day", () => {
  const items = listPublicHolidays("2026-01-01", "2026-12-31", ["KR"]);
  const codes = new Map(items.map((h) => [h.date, h.code]));
  assert.equal(codes.get("2026-02-16"), "seollal-eve");
  assert.equal(codes.get("2026-02-17"), "seollal");
  assert.equal(codes.get("2026-02-18"), "seollal-next");
  assert.equal(codes.get("2026-03-01"), "independence");
  assert.equal(codes.get("2026-03-02"), "independence-obs");
  assert.equal(codes.get("2026-05-01"), "labor");
  assert.equal(codes.get("2026-05-24"), "buddha");
  assert.equal(codes.get("2026-05-25"), "buddha-obs");
  assert.equal(codes.get("2026-07-17"), "constitution");
  assert.equal(codes.get("2026-08-15"), "liberation");
  assert.equal(codes.get("2026-08-17"), "liberation-obs");
  assert.equal(codes.get("2026-09-24"), "chuseok-eve");
  assert.equal(codes.get("2026-09-25"), "chuseok");
  assert.equal(codes.get("2026-09-26"), "chuseok-next");
  assert.equal(codes.get("2026-09-28"), "chuseok-next-obs");
  assert.equal(codes.get("2026-10-03"), "foundation");
  assert.equal(codes.get("2026-10-05"), "foundation-obs");
  assert.equal(codes.has("2026-06-08"), false); // 현충일 Saturday — no substitute
  assert.ok(!dates("KR", "2026-08-01", "2026-08-31").some((d) => d.includes("mountain")));
});

test("Korea 2025 Children's Day + Buddha's Birthday overlap gets a substitute", () => {
  const items = listPublicHolidays("2025-05-01", "2025-05-10", ["KR"]);
  const on5 = items.filter((h) => h.date === "2025-05-05").map((h) => h.code).sort();
  assert.deepEqual(on5, ["buddha", "children"]);
  assert.ok(items.some((h) => h.date === "2025-05-06" && h.code.endsWith("-obs")));
});

test("holiday range filter and BOTH countries", () => {
  const aug = listPublicHolidays("2026-08-01", "2026-08-31", ["KR", "JP"]);
  assert.ok(aug.some((h) => h.country === "JP" && h.date === "2026-08-11"));
  assert.ok(aug.some((h) => h.country === "KR" && h.date === "2026-08-15"));
  assert.ok(!aug.some((h) => h.date.startsWith("2026-07")));
});
