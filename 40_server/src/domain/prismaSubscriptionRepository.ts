import type { PrismaClient, Subscription as PrismaSubscription } from "@prisma/client";
import type {
  CreateSubscriptionInput,
  SubscriptionRepository,
  UpdateSubscriptionInput,
} from "./subscriptionRepository.js";
import type { BillingInterval, SubscriptionRecord } from "./subscriptionTypes.js";

function map(row: PrismaSubscription): SubscriptionRecord {
  return {
    id: row.id,
    userId: row.userId,
    familyId: row.familyId,
    serviceName: row.serviceName,
    cost: Number(row.cost),
    currency: row.currency,
    billingInterval: row.billingInterval as BillingInterval,
    billingMonth: row.billingMonth,
    billingDate: row.billingDate,
    loginId: row.loginId,
    loginPasswordCipher: row.loginPasswordCipher,
    cancelUrl: row.cancelUrl,
    reason: row.reason,
    isShared: row.isShared,
    createdAt: row.createdAt,
  };
}

export class PrismaSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly db: PrismaClient) {}

  async findById(id: number): Promise<SubscriptionRecord | null> {
    const row = await this.db.subscription.findUnique({ where: { id } });
    return row ? map(row) : null;
  }

  async listForUser(userId: number, familyId: number | null): Promise<SubscriptionRecord[]> {
    const rows = await this.db.subscription.findMany({
      where: familyId
        ? {
            OR: [{ userId }, { familyId, isShared: true }],
          }
        : { userId },
      orderBy: [{ billingMonth: "asc" }, { billingDate: "asc" }],
    });
    return rows.map(map);
  }

  async create(input: CreateSubscriptionInput): Promise<SubscriptionRecord> {
    const row = await this.db.subscription.create({
      data: {
        userId: input.userId,
        familyId: input.familyId,
        serviceName: input.serviceName,
        cost: input.cost,
        currency: input.currency,
        billingInterval: input.billingInterval,
        billingMonth: input.billingMonth,
        billingDate: input.billingDate,
        loginId: input.loginId,
        loginPasswordCipher: input.loginPasswordCipher,
        cancelUrl: input.cancelUrl,
        reason: input.reason,
        isShared: input.isShared,
      },
    });
    return map(row);
  }

  async update(id: number, input: UpdateSubscriptionInput): Promise<SubscriptionRecord> {
    const row = await this.db.subscription.update({
      where: { id },
      data: {
        serviceName: input.serviceName,
        cost: input.cost,
        currency: input.currency,
        billingInterval: input.billingInterval,
        billingMonth: input.billingMonth,
        billingDate: input.billingDate,
        loginId: input.loginId,
        loginPasswordCipher: input.loginPasswordCipher,
        cancelUrl: input.cancelUrl,
        reason: input.reason,
        isShared: input.isShared,
      },
    });
    return map(row);
  }

  async remove(id: number): Promise<boolean> {
    try {
      await this.db.subscription.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }
}
