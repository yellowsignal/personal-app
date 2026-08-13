import type { AuthRepository } from "../domain/authRepository.js";
import type { AssetRepository } from "../domain/assetRepository.js";
import type { CalendarRepository } from "../domain/calendarRepository.js";
import type { DocumentRepository } from "../domain/documentRepository.js";
import type { RecurringDepositRepository } from "../domain/recurringDepositRepository.js";
import type { SubscriptionRepository } from "../domain/subscriptionRepository.js";
import {
  eventTimesFromRange,
  isDateKey,
  parseDateKey,
  toDateKey,
  toPublicCalendarEvent,
  type PublicCalendarEvent,
  type ViewScope,
} from "../domain/calendarTypes.js";
import {
  holidayCountries,
  holidayTitle,
  listPublicHolidays,
  parseHolidayPref,
} from "../domain/holidays.js";
import { listDueDates, utcDateOnly } from "../domain/recurringDepositTypes.js";
import { HttpError } from "./authService.js";

const USER_CATEGORIES = new Set(["personal", "family", "holiday"]);

function parseScope(value: unknown): ViewScope {
  if (value === "personal" || value === "family" || value === "all") return value;
  return "all";
}

function parseRange(fromRaw: unknown, toRaw: unknown): { from: Date; to: Date } {
  if (typeof fromRaw !== "string" || typeof toRaw !== "string") {
    throw new HttpError(400, "from and to query params (YYYY-MM-DD) are required");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromRaw) || !/^\d{4}-\d{2}-\d{2}$/.test(toRaw)) {
    throw new HttpError(400, "from/to must be YYYY-MM-DD");
  }
  const from = parseDateKey(fromRaw);
  const to = parseDateKey(toRaw);
  // inclusive end-of-day
  to.setUTCHours(23, 59, 59, 999);
  if (from > to) throw new HttpError(400, "from must be <= to");
  return { from, to };
}

function dayInMonth(year: number, month0: number, day: number): Date {
  const last = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month0, Math.min(day, last)));
}

function expandSubscriptionDates(
  billingInterval: "MONTHLY" | "YEARLY",
  billingDate: number,
  billingMonth: number | null,
  from: Date,
  to: Date,
): Date[] {
  const out: Date[] = [];
  const start = utcDateOnly(from);
  const end = utcDateOnly(to);

  if (billingInterval === "YEARLY") {
    const month0 = (billingMonth ?? 1) - 1;
    for (let y = start.getUTCFullYear() - 1; y <= end.getUTCFullYear() + 1; y++) {
      const d = dayInMonth(y, month0, billingDate);
      if (d >= start && d <= end) out.push(d);
    }
    return out;
  }

  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  const guardEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1));
  while (true) {
    const d = dayInMonth(y, m, billingDate);
    if (d > end && new Date(Date.UTC(y, m, 1)) >= guardEnd) break;
    if (d >= start && d <= end) out.push(d);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    if (y > end.getUTCFullYear() + 1) break;
  }
  return out;
}

export class CalendarService {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly calendarRepo: CalendarRepository,
    private readonly documentRepo: DocumentRepository | null = null,
    private readonly subscriptionRepo: SubscriptionRepository | null = null,
    private readonly recurringRepo: RecurringDepositRepository | null = null,
    private readonly assetRepo: AssetRepository | null = null,
  ) {}

  private async requireUser(userId: number) {
    const user = await this.authRepo.findUserById(userId);
    if (!user) throw new HttpError(401, "unauthorized", "UNAUTHORIZED");
    return user;
  }

  private async ownerName(userId: number): Promise<string> {
    const owner = await this.authRepo.findUserById(userId);
    return owner?.name ?? "Unknown";
  }

  private filterScope(items: PublicCalendarEvent[], scope: ViewScope, userId: number): PublicCalendarEvent[] {
    if (scope === "personal") return items.filter((e) => e.userId === userId && !e.isShared);
    if (scope === "family") return items.filter((e) => e.isShared);
    return items;
  }

  async list(userId: number, query: Record<string, unknown>): Promise<PublicCalendarEvent[]> {
    const user = await this.requireUser(userId);
    const { from, to } = parseRange(query.from, query.to);
    const scope = parseScope(query.scope);
    const out: PublicCalendarEvent[] = [];

    const stored = await this.calendarRepo.listInRange(user.id, user.familyId, from, to);
    for (const row of stored) {
      // Skip document_expiry rows if we also derive — or include stored only for user-created
      if (row.sourceDocumentId != null) continue;
      out.push(toPublicCalendarEvent(row, await this.ownerName(row.userId), true));
    }

    if (this.documentRepo) {
      const docs = await this.documentRepo.listForUser(user.id, user.familyId);
      for (const doc of docs) {
        if (!doc.expiryDate) continue;
        const key = toDateKey(doc.expiryDate);
        if (key < toDateKey(from) || key > toDateKey(to)) continue;
        out.push({
          id: `doc-expiry-${doc.id}`,
          userId: doc.userId,
          title: `${doc.typeLabel}`,
          description: null,
          date: key,
          time: null,
          endDate: key,
          isAllDay: true,
          category: "document_expiry",
          isShared: doc.isShared,
          editable: false,
          sourceDocumentId: doc.id,
          ownerName: await this.ownerName(doc.userId),
        });
      }
    }

    if (this.subscriptionRepo) {
      const subs = await this.subscriptionRepo.listForUser(user.id, user.familyId);
      for (const sub of subs) {
        const dates = expandSubscriptionDates(
          sub.billingInterval,
          sub.billingDate,
          sub.billingMonth,
          from,
          to,
        );
        for (const d of dates) {
          const key = toDateKey(d);
          out.push({
            id: `sub-${sub.id}-${key}`,
            userId: sub.userId,
            title: sub.serviceName,
            description: null,
            date: key,
            time: null,
            endDate: key,
            isAllDay: true,
            category: "subscription_billing",
            isShared: sub.isShared,
            editable: false,
            sourceDocumentId: null,
            ownerName: await this.ownerName(sub.userId),
          });
        }
      }
    }

    if (this.recurringRepo && this.assetRepo) {
      const rules = await this.recurringRepo.listActiveForUser(user.id);
      // also include shared? for now only owned rules; family members see via asset share later
      for (const rule of rules) {
        const asset = await this.assetRepo.findById(rule.assetId);
        if (!asset) continue;
        const dues = listDueDates({
          start: rule.createdAt,
          afterExclusive: null,
          until: utcDateOnly(to),
          billingInterval: rule.billingInterval,
          billingDate: rule.billingDate,
          billingMonth: rule.billingMonth,
        }).filter((d) => d >= utcDateOnly(from) && d <= utcDateOnly(to));

        for (const d of dues) {
          const key = toDateKey(d);
          out.push({
            id: `recurring-${rule.id}-${key}`,
            userId: rule.userId,
            title: `${rule.label} · ${asset.label}`,
            description: null,
            date: key,
            time: null,
            endDate: key,
            isAllDay: true,
            category: "recurring_deposit",
            isShared: asset.isShared,
            editable: false,
            sourceDocumentId: null,
            ownerName: await this.ownerName(rule.userId),
          });
        }
      }
    }

    out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "") || a.id.localeCompare(b.id));
    const scoped = this.filterScope(out, scope, user.id);

    const pref = parseHolidayPref(user.countryPref);
    const holidays = listPublicHolidays(toDateKey(from), toDateKey(to), holidayCountries(pref));
    const lang = user.languagePref === "ja" ? "ja" : "ko";
    for (const h of holidays) {
      scoped.push({
        id: `holiday-${h.country}-${h.date}-${h.code}`,
        userId: user.id,
        title: holidayTitle(h, lang),
        description: h.country === "KR" ? "KR" : "JP",
        date: h.date,
        time: null,
        endDate: h.date,
        isAllDay: true,
        category: "holiday",
        isShared: true,
        editable: false,
        sourceDocumentId: null,
        ownerName:
          h.country === "KR" ? (lang === "ja" ? "韓国" : "한국") : lang === "ja" ? "日本" : "일본",
      });
    }

    scoped.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "") || a.id.localeCompare(b.id));
    return scoped;
  }

  async create(userId: number, body: Record<string, unknown>): Promise<PublicCalendarEvent> {
    const user = await this.requireUser(userId);
    if (typeof body.title !== "string" || !body.title.trim()) {
      throw new HttpError(400, "title is required");
    }
    const category = typeof body.category === "string" ? body.category : "personal";
    if (!USER_CATEGORIES.has(category)) {
      throw new HttpError(400, "category must be personal, family, or holiday");
    }
    if (!isDateKey(body.date)) {
      throw new HttpError(400, "date must be YYYY-MM-DD");
    }

    const endDate = isDateKey(body.endDate) ? body.endDate : body.date;
    const time = typeof body.time === "string" && /^\d{2}:\d{2}$/.test(body.time) ? body.time : null;
    const endTimeClock =
      typeof body.endTime === "string" && /^\d{2}:\d{2}$/.test(body.endTime) ? body.endTime : null;
    const { startTime, endTime, isAllDay } = eventTimesFromRange(body.date, endDate, time, endTimeClock);

    const isShared = body.isShared === true || category === "family" || category === "holiday";
    if (isShared && !user.familyId) {
      throw new HttpError(400, "join a family before sharing events", "NO_FAMILY");
    }

    const record = await this.calendarRepo.create({
      userId: user.id,
      familyId: isShared ? user.familyId : null,
      title: body.title.trim().slice(0, 200),
      description: typeof body.description === "string" ? body.description.trim().slice(0, 2000) || null : null,
      startTime,
      endTime,
      isAllDay,
      category,
      isShared,
    });
    return toPublicCalendarEvent(record, user.name, true);
  }

  async update(userId: number, id: number, body: Record<string, unknown>): Promise<PublicCalendarEvent> {
    const user = await this.requireUser(userId);
    const existing = await this.calendarRepo.findById(id);
    if (!existing) throw new HttpError(404, "event not found", "NOT_FOUND");
    if (existing.userId !== user.id) throw new HttpError(403, "only the owner can edit this event", "FORBIDDEN");
    if (existing.sourceDocumentId != null) {
      throw new HttpError(400, "derived events cannot be edited");
    }

    let startTime = existing.startTime;
    let endTime = existing.endTime;
    let isAllDay = existing.isAllDay;

    if (isDateKey(body.date) || isDateKey(body.endDate)) {
      const publicExisting = toPublicCalendarEvent(existing, "");
      const date = isDateKey(body.date) ? body.date : publicExisting.date;
      const endDate = isDateKey(body.endDate) ? body.endDate : publicExisting.endDate;
      const time =
        typeof body.time === "string" && /^\d{2}:\d{2}$/.test(body.time)
          ? body.time
          : publicExisting.time;
      const endTimeClock =
        typeof body.endTime === "string" && /^\d{2}:\d{2}$/.test(body.endTime) ? body.endTime : null;
      const next = eventTimesFromRange(date, endDate, time, endTimeClock);
      startTime = next.startTime;
      endTime = next.endTime;
      isAllDay = next.isAllDay;
    }

    const category =
      body.category !== undefined
        ? typeof body.category === "string" && USER_CATEGORIES.has(body.category)
          ? body.category
          : (() => {
              throw new HttpError(400, "category must be personal, family, or holiday");
            })()
        : undefined;

    const isShared =
      body.isShared === undefined
        ? undefined
        : body.isShared === true || category === "family" || category === "holiday";

    if (isShared === true && !user.familyId) {
      throw new HttpError(400, "join a family before sharing events", "NO_FAMILY");
    }

    const updated = await this.calendarRepo.update(id, {
      title:
        typeof body.title === "string" && body.title.trim()
          ? body.title.trim().slice(0, 200)
          : undefined,
      description:
        body.description === undefined
          ? undefined
          : typeof body.description === "string"
            ? body.description.trim().slice(0, 2000) || null
            : null,
      startTime,
      endTime,
      isAllDay,
      category,
      isShared,
      familyId: isShared === undefined ? undefined : isShared ? user.familyId : null,
    });
    return toPublicCalendarEvent(updated, user.name, true);
  }

  async remove(userId: number, id: number): Promise<void> {
    const user = await this.requireUser(userId);
    const existing = await this.calendarRepo.findById(id);
    if (!existing) throw new HttpError(404, "event not found", "NOT_FOUND");
    if (existing.userId !== user.id) throw new HttpError(403, "only the owner can delete this event", "FORBIDDEN");
    if (existing.sourceDocumentId != null) {
      throw new HttpError(400, "derived events cannot be deleted here");
    }
    await this.calendarRepo.remove(id);
  }
}

export type { CalendarCategory } from "../domain/calendarTypes.js";
