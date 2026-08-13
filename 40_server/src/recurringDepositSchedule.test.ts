import assert from "node:assert/strict";
import { test } from "node:test";
import { listDueDates, nextDueDate, utcDateOnly } from "./domain/recurringDepositTypes.js";

test("listDueDates monthly catches up missed months", () => {
  const start = new Date(Date.UTC(2026, 0, 10)); // Jan 10
  const until = new Date(Date.UTC(2026, 3, 15)); // Apr 15
  const dues = listDueDates({
    start,
    afterExclusive: null,
    until,
    billingInterval: "MONTHLY",
    billingDate: 25,
    billingMonth: null,
  });
  assert.deepEqual(
    dues.map((d) => d.toISOString().slice(0, 10)),
    ["2026-01-25", "2026-02-25", "2026-03-25"],
  );
});

test("listDueDates skips already applied dates", () => {
  const start = new Date(Date.UTC(2026, 0, 1));
  const until = new Date(Date.UTC(2026, 2, 31));
  const dues = listDueDates({
    start,
    afterExclusive: new Date(Date.UTC(2026, 0, 15)),
    until,
    billingInterval: "MONTHLY",
    billingDate: 15,
    billingMonth: null,
  });
  assert.deepEqual(
    dues.map((d) => d.toISOString().slice(0, 10)),
    ["2026-02-15", "2026-03-15"],
  );
});

test("listDueDates clamps day 31 to month length", () => {
  const start = new Date(Date.UTC(2026, 0, 1));
  const until = new Date(Date.UTC(2026, 2, 31));
  const dues = listDueDates({
    start,
    afterExclusive: null,
    until,
    billingInterval: "MONTHLY",
    billingDate: 31,
    billingMonth: null,
  });
  assert.equal(dues[0]!.toISOString().slice(0, 10), "2026-01-31");
  assert.equal(dues[1]!.toISOString().slice(0, 10), "2026-02-28");
  assert.equal(dues[2]!.toISOString().slice(0, 10), "2026-03-31");
});

test("nextDueDate returns the next future occurrence", () => {
  const start = new Date(Date.UTC(2026, 0, 1));
  const from = new Date(Date.UTC(2026, 3, 10));
  const next = nextDueDate({
    start,
    afterExclusive: new Date(Date.UTC(2026, 2, 15)),
    billingInterval: "MONTHLY",
    billingDate: 15,
    billingMonth: null,
    from,
  });
  assert.equal(next && utcDateOnly(next).toISOString().slice(0, 10), "2026-04-15");
});
