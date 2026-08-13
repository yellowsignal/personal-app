import type { PrismaClient, RecurringDeposit as PrismaRow } from "@prisma/client";
import type {
  CreateRecurringDepositInput,
  RecurringDepositRepository,
  UpdateRecurringDepositInput,
} from "./recurringDepositRepository.js";
import type { RecurringDepositRecord } from "./recurringDepositTypes.js";
import type { BillingInterval } from "./subscriptionTypes.js";

function map(row: PrismaRow): RecurringDepositRecord {
  return {
    id: row.id,
    userId: row.userId,
    familyId: row.familyId,
    assetId: row.assetId,
    label: row.label,
    amount: Number(row.amount),
    currency: row.currency,
    billingInterval: row.billingInterval as BillingInterval,
    billingMonth: row.billingMonth,
    billingDate: row.billingDate,
    isActive: row.isActive,
    lastAppliedOn: row.lastAppliedOn,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaRecurringDepositRepository implements RecurringDepositRepository {
  constructor(private readonly db: PrismaClient) {}

  async findById(id: number): Promise<RecurringDepositRecord | null> {
    const row = await this.db.recurringDeposit.findUnique({ where: { id } });
    return row ? map(row) : null;
  }

  async listForAsset(assetId: number): Promise<RecurringDepositRecord[]> {
    const rows = await this.db.recurringDeposit.findMany({
      where: { assetId },
      orderBy: { id: "asc" },
    });
    return rows.map(map);
  }

  async listActiveForUser(userId: number): Promise<RecurringDepositRecord[]> {
    const rows = await this.db.recurringDeposit.findMany({
      where: { userId, isActive: true },
    });
    return rows.map(map);
  }

  async create(input: CreateRecurringDepositInput): Promise<RecurringDepositRecord> {
    const row = await this.db.recurringDeposit.create({
      data: {
        userId: input.userId,
        familyId: input.familyId,
        assetId: input.assetId,
        label: input.label,
        amount: input.amount,
        currency: input.currency,
        billingInterval: input.billingInterval,
        billingMonth: input.billingMonth,
        billingDate: input.billingDate,
        isActive: input.isActive ?? true,
      },
    });
    return map(row);
  }

  async update(id: number, input: UpdateRecurringDepositInput): Promise<RecurringDepositRecord> {
    const row = await this.db.recurringDeposit.update({
      where: { id },
      data: {
        label: input.label,
        amount: input.amount,
        billingInterval: input.billingInterval,
        billingMonth: input.billingMonth,
        billingDate: input.billingDate,
        isActive: input.isActive,
        lastAppliedOn: input.lastAppliedOn,
      },
    });
    return map(row);
  }

  async remove(id: number): Promise<boolean> {
    try {
      await this.db.recurringDeposit.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }
}
