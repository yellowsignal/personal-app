export type ViewScope = "all" | "personal" | "family";
export type BillingInterval = "MONTHLY" | "YEARLY";

export interface SubscriptionRecord {
  id: number;
  userId: number;
  familyId: number | null;
  serviceName: string;
  cost: number;
  currency: string;
  billingInterval: BillingInterval;
  billingMonth: number | null;
  billingDate: number;
  cancelUrl: string | null;
  reason: string | null;
  isShared: boolean;
  createdAt: Date;
}

export interface PublicSubscription {
  id: number;
  userId: number;
  familyId: number | null;
  serviceName: string;
  cost: number;
  currency: string;
  billingInterval: BillingInterval;
  billingMonth: number | null;
  billingDate: number;
  cancelUrl: string | null;
  reason: string | null;
  isShared: boolean;
  createdAt: string;
  ownerName: string;
}

export function toPublicSubscription(
  record: SubscriptionRecord,
  ownerName: string,
): PublicSubscription {
  return {
    id: record.id,
    userId: record.userId,
    familyId: record.familyId,
    serviceName: record.serviceName,
    cost: record.cost,
    currency: record.currency,
    billingInterval: record.billingInterval,
    billingMonth: record.billingMonth,
    billingDate: record.billingDate,
    cancelUrl: record.cancelUrl,
    reason: record.reason,
    isShared: record.isShared,
    createdAt: record.createdAt.toISOString(),
    ownerName,
  };
}
