import assert from "node:assert/strict";
import { test } from "node:test";
import type { PublicCalendarEvent } from "../api/calendar.ts";
import {
  isUpcomingCalendarEvent,
  pickDashboardUpcomingEvents,
  uniqueUpcomingBySeries,
} from "./upcomingEvents.ts";

function ev(partial: Partial<PublicCalendarEvent> & Pick<PublicCalendarEvent, "id" | "date" | "title">): PublicCalendarEvent {
  return {
    userId: 1,
    description: null,
    time: null,
    endDate: partial.date,
    isAllDay: true,
    category: "personal",
    isShared: false,
    editable: true,
    sourceDocumentId: null,
    ownerName: "민호",
    seriesId: partial.id,
    recurrence: null,
    reminderMinutesBefore: null,
    ...partial,
  };
}

test("isUpcomingCalendarEvent drops ended all-day and timed events", () => {
  const now = new Date("2026-09-02T12:00:00.000Z");

  assert.equal(
    isUpcomingCalendarEvent(ev({ id: "1", date: "2026-09-01", title: "yesterday" }), now),
    false,
  );
  assert.equal(
    isUpcomingCalendarEvent(ev({ id: "2", date: "2026-09-02", title: "today all-day" }), now),
    true,
  );
  assert.equal(
    isUpcomingCalendarEvent(
      ev({
        id: "3",
        date: "2026-08-28",
        endDate: "2026-09-05",
        title: "trip",
      }),
      now,
    ),
    true,
  );
  assert.equal(
    isUpcomingCalendarEvent(
      ev({
        id: "4",
        date: "2026-09-02",
        title: "morning",
        isAllDay: false,
        time: "09:00",
        endTime: "10:00",
      }),
      now,
    ),
    false,
  );
  assert.equal(
    isUpcomingCalendarEvent(
      ev({
        id: "5",
        date: "2026-09-02",
        title: "afternoon",
        isAllDay: false,
        time: "14:00",
        endTime: "15:00",
      }),
      now,
    ),
    true,
  );
});

test("pickDashboardUpcomingEvents filters holidays, past items, and caps series", () => {
  const now = new Date("2026-09-02T12:00:00.000Z");
  const items = [
    ev({ id: "10:2026-09-01", seriesId: "10", date: "2026-09-01", title: "past lesson" }),
    ev({ id: "10:2026-09-08", seriesId: "10", date: "2026-09-08", title: "next lesson" }),
    ev({ id: "10:2026-09-15", seriesId: "10", date: "2026-09-15", title: "later lesson" }),
    ev({ id: "h1", date: "2026-09-03", title: "holiday", category: "holiday" }),
    ev({ id: "s1", date: "2026-09-04", title: "netflix", category: "subscription_billing" }),
    ev({ id: "20", date: "2026-09-03", title: "dentist" }),
    ev({ id: "30", date: "2026-09-05", title: "picnic" }),
  ];

  const picked = pickDashboardUpcomingEvents(items, { now, limit: 3 });
  assert.deepEqual(
    picked.map((e) => e.title),
    ["dentist", "picnic", "next lesson"],
  );
});

test("uniqueUpcomingBySeries keeps first sorted occurrence per series", () => {
  const sorted = [
    ev({ id: "1:2026-09-08", seriesId: "1", date: "2026-09-08", title: "a" }),
    ev({ id: "1:2026-09-15", seriesId: "1", date: "2026-09-15", title: "b" }),
    ev({ id: "2", seriesId: "2", date: "2026-09-09", title: "c" }),
  ];
  const out = uniqueUpcomingBySeries(sorted, 3);
  assert.equal(out.length, 2);
  assert.equal(out[0]!.title, "a");
  assert.equal(out[1]!.title, "c");
});
