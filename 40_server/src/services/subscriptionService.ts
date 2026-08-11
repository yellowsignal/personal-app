import type { AuthRepository } from "../domain/authRepository.js";
import type { SubscriptionRepository } from "../domain/subscriptionRepository.js";
import {
  toPublicSubscription,
  type BillingInterval,
  type PublicSubscription,
  type ViewScope,
} from "../domain/subscriptionTypes.js";
import { HttpError } from "./authService.js";

const CURRENCIES = new Set(["KRW", "JPY", "USD"]);

function parseScope(value: unknown): ViewScope {
  if (value === "personal" || value === "family" || value === "all") return value;
  return "all";
}

function parseCost(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, "cost must be a non-negative number");
  return n;
}

function parseBillingDate(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 31) {
    throw new HttpError(400, "billingDate must be between 1 and 31");
  }
  return n;
}

function parseBillingMonth(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 12) {
    throw new HttpError(400, "billingMonth must be between 1 and 12");
  }
  return n;
}

function parseBillingInterval(value: unknown): BillingInterval {
  if (value === "YEARLY" || value === "year" || value === "yearly") return "YEARLY";
  if (value === "MONTHLY" || value === "month" || value === "monthly" || value === undefined || value === null) {
    return "MONTHLY";
  }
  throw new HttpError(400, "billingInterval must be MONTHLY or YEARLY");
}

function parseBillingFields(body: Record<string, unknown>, required: boolean) {
  const hasAny =
    body.billingInterval !== undefined ||
    body.billingDate !== undefined ||
    body.billingMonth !== undefined ||
    body.billingAnchorDate !== undefined;

  if (!required && !hasAny) {
    return null;
  }

  // Prefer ISO date from mobile date picker: "2026-08-05"
  if (typeof body.billingAnchorDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(body.billingAnchorDate)) {
    const [, mm, dd] = body.billingAnchorDate.slice(0, 10).split("-").map(Number);
    if (!Number.isInteger(mm) || mm < 1 || mm > 12 || !Number.isInteger(dd) || dd < 1 || dd > 31) {
      throw new HttpError(400, "billingAnchorDate must be a valid YYYY-MM-DD date");
    }
    const interval = parseBillingInterval(body.billingInterval);
    return {
      billingInterval: interval,
      billingMonth: interval === "YEARLY" ? mm : null,
      billingDate: dd,
    };
  }

  const interval = parseBillingInterval(body.billingInterval);
  const billingDate = parseBillingDate(body.billingDate);
  const billingMonth =
    interval === "YEARLY" ? parseBillingMonth(body.billingMonth) : null;
  if (interval === "YEARLY" && (body.billingMonth === undefined || body.billingMonth === null)) {
    throw new HttpError(400, "billingMonth is required for YEARLY billing");
  }
  return { billingInterval: interval, billingMonth, billingDate };
}

function parseCurrency(value: unknown): string {
  if (typeof value !== "string" || !CURRENCIES.has(value)) {
    throw new HttpError(400, "currency must be KRW, JPY, or USD");
  }
  return value;
}

export class SubscriptionService {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly subscriptionRepo: SubscriptionRepository,
  ) {}

  private async requireUser(userId: number) {
    const user = await this.authRepo.findUserById(userId);
    if (!user) throw new HttpError(401, "unauthorized", "UNAUTHORIZED");
    return user;
  }

  private filterScope(
    items: PublicSubscription[],
    scope: ViewScope,
    userId: number,
  ): PublicSubscription[] {
    // personal = what I pay (owned by me), even if also shared with family
    if (scope === "personal") return items.filter((s) => Number(s.userId) === Number(userId));
    if (scope === "family") return items.filter((s) => s.isShared);
    return items;
  }

  private async withOwners(records: Awaited<ReturnType<SubscriptionRepository["listForUser"]>>) {
    const nameCache = new Map<number, string>();
    const out: PublicSubscription[] = [];
    for (const record of records) {
      let ownerName = nameCache.get(record.userId);
      if (!ownerName) {
        const owner = await this.authRepo.findUserById(record.userId);
        ownerName = owner?.name ?? "Unknown";
        nameCache.set(record.userId, ownerName);
      }
      out.push(toPublicSubscription(record, ownerName));
    }
    return out;
  }

  async list(userId: number, scopeRaw: unknown): Promise<PublicSubscription[]> {
    const user = await this.requireUser(userId);
    const scope = parseScope(scopeRaw);
    const records = await this.subscriptionRepo.listForUser(userId, user.familyId);
    const withOwners = await this.withOwners(records);
    return this.filterScope(withOwners, scope, userId);
  }

  async create(userId: number, body: Record<string, unknown>): Promise<PublicSubscription> {
    const user = await this.requireUser(userId);
    if (typeof body.serviceName !== "string" || !body.serviceName.trim()) {
      throw new HttpError(400, "serviceName is required");
    }
    const isShared = body.isShared === true;
    if (isShared && !user.familyId) {
      throw new HttpError(400, "join a family before sharing subscriptions", "NO_FAMILY");
    }
    const billing = parseBillingFields(body, true)!;
    const record = await this.subscriptionRepo.create({
      userId: user.id,
      familyId: user.familyId,
      serviceName: body.serviceName.trim(),
      cost: parseCost(body.cost),
      currency: parseCurrency(body.currency),
      billingInterval: billing.billingInterval,
      billingMonth: billing.billingMonth,
      billingDate: billing.billingDate,
      cancelUrl: typeof body.cancelUrl === "string" && body.cancelUrl.trim() ? body.cancelUrl.trim() : null,
      reason: typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null,
      isShared,
    });
    return toPublicSubscription(record, user.name);
  }

  async update(userId: number, id: number, body: Record<string, unknown>): Promise<PublicSubscription> {
    const user = await this.requireUser(userId);
    const existing = await this.subscriptionRepo.findById(id);
    if (!existing) throw new HttpError(404, "subscription not found", "NOT_FOUND");
    if (existing.userId !== user.id) {
      throw new HttpError(403, "only the owner can edit this subscription", "FORBIDDEN");
    }
    const isShared = body.isShared === undefined ? existing.isShared : body.isShared === true;
    if (isShared && !user.familyId) {
      throw new HttpError(400, "join a family before sharing subscriptions", "NO_FAMILY");
    }
    const billing = parseBillingFields(body, false);
    const updated = await this.subscriptionRepo.update(id, {
      serviceName:
        typeof body.serviceName === "string" && body.serviceName.trim()
          ? body.serviceName.trim()
          : undefined,
      cost: body.cost === undefined ? undefined : parseCost(body.cost),
      currency: body.currency === undefined ? undefined : parseCurrency(body.currency),
      billingInterval: billing?.billingInterval,
      billingMonth: billing ? billing.billingMonth : undefined,
      billingDate: billing?.billingDate,
      cancelUrl:
        body.cancelUrl === undefined
          ? undefined
          : typeof body.cancelUrl === "string" && body.cancelUrl.trim()
            ? body.cancelUrl.trim()
            : null,
      reason:
        body.reason === undefined
          ? undefined
          : typeof body.reason === "string" && body.reason.trim()
            ? body.reason.trim()
            : null,
      isShared: body.isShared === undefined ? undefined : isShared,
    });
    return toPublicSubscription(updated, user.name);
  }

  async remove(userId: number, id: number): Promise<void> {
    const user = await this.requireUser(userId);
    const existing = await this.subscriptionRepo.findById(id);
    if (!existing) throw new HttpError(404, "subscription not found", "NOT_FOUND");
    if (existing.userId !== user.id) {
      throw new HttpError(403, "only the owner can delete this subscription", "FORBIDDEN");
    }
    await this.subscriptionRepo.remove(id);
  }
}
