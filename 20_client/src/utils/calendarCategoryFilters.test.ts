import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALL_CALENDAR_CATEGORIES,
  CALENDAR_CATEGORY_FILTER_KEY,
  filterEventsForCalendarTags,
  readActiveCalendarCategories,
  toggleCalendarCategory,
  writeActiveCalendarCategories,
} from "./calendarCategoryFilters";

function memoryStore(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key]! : null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
    snapshot() {
      return { ...data };
    },
  };
}

test("defaults to all tags on when nothing is stored", () => {
  const store = memoryStore();
  const active = readActiveCalendarCategories(store);
  assert.deepEqual([...active].sort(), [...ALL_CALENDAR_CATEGORIES].sort());
});

test("remembers tags the user turned off and restores them next read", () => {
  const store = memoryStore();
  let active = readActiveCalendarCategories(store);
  active = toggleCalendarCategory(active, "holiday");
  active = toggleCalendarCategory(active, "subscription_billing");
  writeActiveCalendarCategories(active, store);

  const saved = JSON.parse(store.snapshot()[CALENDAR_CATEGORY_FILTER_KEY]!) as Record<string, boolean>;
  assert.equal(saved.holiday, false);
  assert.equal(saved.subscription_billing, false);
  assert.equal(saved.personal, true);

  const restored = readActiveCalendarCategories(store);
  assert.equal(restored.has("holiday"), false);
  assert.equal(restored.has("subscription_billing"), false);
  assert.equal(restored.has("personal"), true);
  assert.equal(restored.has("family"), true);
  assert.equal(restored.has("document_expiry"), true);
  assert.equal(restored.has("recurring_deposit"), true);
});

test("turning a tag back on is also remembered", () => {
  const store = memoryStore();
  let active = toggleCalendarCategory(readActiveCalendarCategories(store), "family");
  writeActiveCalendarCategories(active, store);
  active = toggleCalendarCategory(readActiveCalendarCategories(store), "family");
  writeActiveCalendarCategories(active, store);
  assert.equal(readActiveCalendarCategories(store).has("family"), true);
});

test("missing keys default to on so new tags are visible", () => {
  const store = memoryStore({
    [CALENDAR_CATEGORY_FILTER_KEY]: JSON.stringify({ personal: true, holiday: false }),
  });
  const active = readActiveCalendarCategories(store);
  assert.equal(active.has("holiday"), false);
  assert.equal(active.has("company"), true);
  assert.equal(active.has("family"), true);
  assert.equal(active.has("recurring_deposit"), true);
});

test("corrupt storage falls back to all on", () => {
  const store = memoryStore({ [CALENDAR_CATEGORY_FILTER_KEY]: "{not-json" });
  const active = readActiveCalendarCategories(store);
  assert.equal(active.size, ALL_CALENDAR_CATEGORIES.length);
});

test("turning company tag off shows 휴일출근 days as holidays", () => {
  const events = [
    { category: "holiday" as const, date: "2026-11-03", description: null, title: "문화의 날" },
    { category: "company" as const, date: "2026-11-03", description: "work", title: "출근 · 문화의 날" },
    { category: "company" as const, date: "2026-08-13", description: "off", title: "하기휴가" },
  ];
  const allOn = new Set(ALL_CALENDAR_CATEGORIES);
  const withCompany = filterEventsForCalendarTags(events, allOn);
  assert.equal(withCompany.some((e) => e.category === "holiday" && e.date === "2026-11-03"), false);
  assert.ok(withCompany.some((e) => e.category === "company" && e.description === "work"));
  assert.ok(withCompany.some((e) => e.date === "2026-08-13"));

  const companyOff = toggleCalendarCategory(allOn, "company");
  const withoutCompany = filterEventsForCalendarTags(events, companyOff);
  assert.ok(withoutCompany.some((e) => e.category === "holiday" && e.date === "2026-11-03"));
  assert.equal(withoutCompany.some((e) => e.category === "company"), false);
});
