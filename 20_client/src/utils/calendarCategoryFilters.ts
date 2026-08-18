import type { CalendarCategory } from "../api/calendar";

export const CALENDAR_CATEGORY_FILTER_KEY = "myfamilyhub_calendar_category_filters";

export const ALL_CALENDAR_CATEGORIES: CalendarCategory[] = [
  "personal",
  "family",
  "holiday",
  "company",
  "document_expiry",
  "subscription_billing",
  "recurring_deposit",
];

export interface CalendarCategoryFilterStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStore(): CalendarCategoryFilterStore | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function allOn(): Set<CalendarCategory> {
  return new Set(ALL_CALENDAR_CATEGORIES);
}

/** Missing keys default to on so newly added tags appear until the user turns them off. */
export function readActiveCalendarCategories(
  store: CalendarCategoryFilterStore | null = defaultStore(),
): Set<CalendarCategory> {
  if (!store) return allOn();
  try {
    const raw = store.getItem(CALENDAR_CATEGORY_FILTER_KEY);
    if (!raw) return allOn();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return allOn();
    const record = parsed as Record<string, unknown>;
    const next = new Set<CalendarCategory>();
    for (const cat of ALL_CALENDAR_CATEGORIES) {
      if (record[cat] !== false) next.add(cat);
    }
    return next;
  } catch {
    return allOn();
  }
}

export function writeActiveCalendarCategories(
  active: ReadonlySet<CalendarCategory>,
  store: CalendarCategoryFilterStore | null = defaultStore(),
): void {
  if (!store) return;
  const record: Record<CalendarCategory, boolean> = {
    personal: active.has("personal"),
    family: active.has("family"),
    holiday: active.has("holiday"),
    company: active.has("company"),
    document_expiry: active.has("document_expiry"),
    subscription_billing: active.has("subscription_billing"),
    recurring_deposit: active.has("recurring_deposit"),
  };
  try {
    store.setItem(CALENDAR_CATEGORY_FILTER_KEY, JSON.stringify(record));
  } catch {
    /* quota / private mode */
  }
}

export function filterEventsForCalendarTags<
  T extends { category: CalendarCategory; date: string; description?: string | null },
>(events: T[], active: ReadonlySet<CalendarCategory>): T[] {
  const companyOn = active.has("company");
  const workDates = new Set(
    events.filter((e) => e.category === "company" && e.description === "work").map((e) => e.date),
  );
  return events.filter((e) => {
    if (!active.has(e.category)) return false;
    if (companyOn && e.category === "holiday" && workDates.has(e.date)) return false;
    return true;
  });
}

export function toggleCalendarCategory(
  current: ReadonlySet<CalendarCategory>,
  cat: CalendarCategory,
): Set<CalendarCategory> {
  const next = new Set(current);
  if (next.has(cat)) next.delete(cat);
  else next.add(cat);
  return next;
}
