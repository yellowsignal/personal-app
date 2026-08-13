import type { BillingInterval } from "./subscriptionTypes.js";

export interface RecurringDepositRecord {
  id: number;
  userId: number;
  familyId: number | null;
  assetId: number;
  label: string;
  amount: number;
  currency: string;
  billingInterval: BillingInterval;
  billingMonth: number | null;
  billingDate: number;
  isActive: boolean;
  lastAppliedOn: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicRecurringDeposit {
  id: number;
  userId: number;
  assetId: number;
  label: string;
  amount: number;
  currency: string;
  billingInterval: BillingInterval;
  billingMonth: number | null;
  billingDate: number;
  isActive: boolean;
  lastAppliedOn: string | null;
  nextDueOn: string | null;
  createdAt: string;
}

export function toPublicRecurringDeposit(
  record: RecurringDepositRecord,
  nextDueOn: string | null,
): PublicRecurringDeposit {
  return {
    id: record.id,
    userId: record.userId,
    assetId: record.assetId,
    label: record.label,
    amount: record.amount,
    currency: record.currency,
    billingInterval: record.billingInterval,
    billingMonth: record.billingMonth,
    billingDate: record.billingDate,
    isActive: record.isActive,
    lastAppliedOn: record.lastAppliedOn
      ? record.lastAppliedOn.toISOString().slice(0, 10)
      : null,
    nextDueOn,
    createdAt: record.createdAt.toISOString(),
  };
}

/** UTC date-only (midnight UTC). */
export function utcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function dayInMonth(year: number, month0: number, day: number): Date {
  const last = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month0, Math.min(day, last)));
}

/** Occurrence dates strictly after `afterExclusive` (or from start), up to and including `until`. */
export function listDueDates(params: {
  start: Date;
  afterExclusive: Date | null;
  until: Date;
  billingInterval: BillingInterval;
  billingDate: number;
  billingMonth: number | null;
}): Date[] {
  const start = utcDateOnly(params.start);
  const until = utcDateOnly(params.until);
  const after = params.afterExclusive ? utcDateOnly(params.afterExclusive) : null;
  const out: Date[] = [];

  if (params.billingInterval === "YEARLY") {
    const month0 = (params.billingMonth ?? 1) - 1;
    let y = start.getUTCFullYear();
    let cursor = dayInMonth(y, month0, params.billingDate);
    if (cursor < start) {
      y += 1;
      cursor = dayInMonth(y, month0, params.billingDate);
    }
    while (cursor <= until) {
      if (!after || cursor > after) out.push(cursor);
      y += 1;
      cursor = dayInMonth(y, month0, params.billingDate);
    }
    return out;
  }

  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  let cursor = dayInMonth(y, m, params.billingDate);
  if (cursor < start) {
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    cursor = dayInMonth(y, m, params.billingDate);
  }
  while (cursor <= until) {
    if (!after || cursor > after) out.push(cursor);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    cursor = dayInMonth(y, m, params.billingDate);
  }
  return out;
}

export function nextDueDate(params: {
  start: Date;
  afterExclusive: Date | null;
  billingInterval: BillingInterval;
  billingDate: number;
  billingMonth: number | null;
  from?: Date;
}): Date | null {
  const from = utcDateOnly(params.from ?? new Date());
  // Look ahead up to 14 months / 2 years
  const until =
    params.billingInterval === "YEARLY"
      ? new Date(Date.UTC(from.getUTCFullYear() + 2, from.getUTCMonth(), from.getUTCDate()))
      : new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 14, from.getUTCDate()));
  const due = listDueDates({
    start: params.start,
    afterExclusive: params.afterExclusive,
    until,
    billingInterval: params.billingInterval,
    billingDate: params.billingDate,
    billingMonth: params.billingMonth,
  });
  return due[0] ?? null;
}
