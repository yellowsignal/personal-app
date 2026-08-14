import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALL_CALENDAR_CATEGORIES,
  CALENDAR_CATEGORY_FILTER_KEY,
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
  assert.equal(active.has("family"), true);
  assert.equal(active.has("recurring_deposit"), true);
});

test("corrupt storage falls back to all on", () => {
  const store = memoryStore({ [CALENDAR_CATEGORY_FILTER_KEY]: "{not-json" });
  const active = readActiveCalendarCategories(store);
  assert.equal(active.size, ALL_CALENDAR_CATEGORIES.length);
});
