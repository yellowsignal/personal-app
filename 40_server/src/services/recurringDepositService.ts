import type { AuthRepository } from "../domain/authRepository.js";
import type { AssetRepository } from "../domain/assetRepository.js";
import type { RecurringDepositRepository } from "../domain/recurringDepositRepository.js";
import type { TransactionRepository } from "../domain/transactionRepository.js";
import {
  listDueDates,
  nextDueDate,
  toPublicRecurringDeposit,
  utcDateOnly,
  type PublicRecurringDeposit,
  type RecurringDepositRecord,
} from "../domain/recurringDepositTypes.js";
import type { BillingInterval } from "../domain/subscriptionTypes.js";
import { HttpError } from "./authService.js";

function parseAmount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new HttpError(400, "amount must be a positive number");
  return n;
}

function parseLabel(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, "label is required");
  return value.trim().slice(0, 200);
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

  if (!required && !hasAny) return null;

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
  const billingMonth = interval === "YEARLY" ? parseBillingMonth(body.billingMonth) : null;
  if (interval === "YEARLY" && (body.billingMonth === undefined || body.billingMonth === null)) {
    throw new HttpError(400, "billingMonth is required for YEARLY billing");
  }
  return { billingInterval: interval, billingMonth, billingDate };
}

export class RecurringDepositService {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly assetRepo: AssetRepository,
    private readonly recurringRepo: RecurringDepositRepository,
    private readonly transactionRepo: TransactionRepository,
  ) {}

  private async requireUser(userId: number) {
    const user = await this.authRepo.findUserById(userId);
    if (!user) throw new HttpError(401, "unauthorized", "UNAUTHORIZED");
    return user;
  }

  private canViewAsset(
    asset: { userId: number; familyId: number | null; isShared: boolean },
    userId: number,
    familyId: number | null,
  ): boolean {
    if (asset.userId === userId) return true;
    return Boolean(
      asset.isShared && familyId !== null && asset.familyId !== null && asset.familyId === familyId,
    );
  }

  private toPublic(record: RecurringDepositRecord): PublicRecurringDeposit {
    const next = record.isActive
      ? nextDueDate({
          start: record.createdAt,
          afterExclusive: record.lastAppliedOn,
          billingInterval: record.billingInterval,
          billingDate: record.billingDate,
          billingMonth: record.billingMonth,
        })
      : null;
    return toPublicRecurringDeposit(record, next ? next.toISOString().slice(0, 10) : null);
  }

  /** Apply all due recurring credits for this user (lazy catch-up). */
  async applyDueForUser(userId: number): Promise<number> {
    const rules = await this.recurringRepo.listActiveForUser(userId);
    let applied = 0;
    const today = utcDateOnly(new Date());

    for (const rule of rules) {
      const asset = await this.assetRepo.findById(rule.assetId);
      if (!asset || asset.type !== "deposit" || asset.userId !== userId) continue;

      const dues = listDueDates({
        start: rule.createdAt,
        afterExclusive: rule.lastAppliedOn,
        until: today,
        billingInterval: rule.billingInterval,
        billingDate: rule.billingDate,
        billingMonth: rule.billingMonth,
      });

      let balance = asset.amount;
      let lastApplied = rule.lastAppliedOn;

      for (const due of dues) {
        const dup = await this.transactionRepo.existsDuplicate(
          asset.id,
          due,
          rule.amount,
          "credit",
          rule.label,
        );
        if (!dup) {
          balance = Math.round((balance + rule.amount) * 100) / 100;
          await this.transactionRepo.createMany([
            {
              userId: asset.userId,
              familyId: asset.familyId,
              assetId: asset.id,
              category: "credit",
              amount: rule.amount,
              currency: asset.currency,
              date: due,
              description: rule.label,
              balanceAfter: balance,
              isShared: asset.isShared,
            },
          ]);
          applied += 1;
        }
        lastApplied = due;
      }

      if (dues.length > 0) {
        await this.recurringRepo.update(rule.id, { lastAppliedOn: lastApplied });
        if (balance !== asset.amount) {
          await this.assetRepo.update(asset.id, { amount: balance });
        }
      }
    }

    return applied;
  }

  async applyDueForAsset(userId: number, assetId: number): Promise<number> {
    // Apply all for user then filter isn't needed — applyDueForUser is cheap enough for personal apps
    void assetId;
    return this.applyDueForUser(userId);
  }

  async listForAsset(userId: number, assetId: number): Promise<PublicRecurringDeposit[]> {
    const user = await this.requireUser(userId);
    const asset = await this.assetRepo.findById(assetId);
    if (!asset) throw new HttpError(404, "asset not found", "NOT_FOUND");
    if (!this.canViewAsset(asset, user.id, user.familyId)) {
      throw new HttpError(403, "forbidden", "FORBIDDEN");
    }
    if (asset.userId === user.id) {
      await this.applyDueForUser(user.id);
    }
    const rows = await this.recurringRepo.listForAsset(assetId);
    return rows.map((r) => this.toPublic(r));
  }

  async create(userId: number, assetId: number, body: Record<string, unknown>): Promise<PublicRecurringDeposit> {
    const user = await this.requireUser(userId);
    const asset = await this.assetRepo.findById(assetId);
    if (!asset) throw new HttpError(404, "asset not found", "NOT_FOUND");
    if (asset.userId !== user.id) throw new HttpError(403, "only the owner can manage recurring deposits", "FORBIDDEN");
    if (asset.type !== "deposit") throw new HttpError(400, "recurring deposits are only for deposit assets");

    const label = parseLabel(body.label);
    const amount = parseAmount(body.amount);
    const billing = parseBillingFields(body, true);
    if (!billing) throw new HttpError(400, "billing schedule is required");

    const record = await this.recurringRepo.create({
      userId: user.id,
      familyId: user.familyId,
      assetId: asset.id,
      label,
      amount,
      currency: asset.currency,
      billingInterval: billing.billingInterval,
      billingMonth: billing.billingMonth,
      billingDate: billing.billingDate,
      isActive: body.isActive === false ? false : true,
    });

    await this.applyDueForUser(user.id);
    const refreshed = (await this.recurringRepo.findById(record.id)) ?? record;
    return this.toPublic(refreshed);
  }

  async update(userId: number, id: number, body: Record<string, unknown>): Promise<PublicRecurringDeposit> {
    const user = await this.requireUser(userId);
    const existing = await this.recurringRepo.findById(id);
    if (!existing) throw new HttpError(404, "recurring deposit not found", "NOT_FOUND");
    if (existing.userId !== user.id) {
      throw new HttpError(403, "only the owner can manage recurring deposits", "FORBIDDEN");
    }

    const billing = parseBillingFields(body, false);
    const updated = await this.recurringRepo.update(id, {
      label: body.label !== undefined ? parseLabel(body.label) : undefined,
      amount: body.amount !== undefined ? parseAmount(body.amount) : undefined,
      billingInterval: billing?.billingInterval,
      billingMonth: billing ? billing.billingMonth : undefined,
      billingDate: billing?.billingDate,
      isActive: body.isActive === undefined ? undefined : body.isActive === true,
    });

    await this.applyDueForUser(user.id);
    const refreshed = (await this.recurringRepo.findById(updated.id)) ?? updated;
    return this.toPublic(refreshed);
  }

  async remove(userId: number, id: number): Promise<void> {
    const user = await this.requireUser(userId);
    const existing = await this.recurringRepo.findById(id);
    if (!existing) throw new HttpError(404, "recurring deposit not found", "NOT_FOUND");
    if (existing.userId !== user.id) {
      throw new HttpError(403, "only the owner can manage recurring deposits", "FORBIDDEN");
    }
    await this.recurringRepo.remove(id);
  }
}
