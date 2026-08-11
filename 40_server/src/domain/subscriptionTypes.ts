export type ViewScope = "all" | "personal" | "family";

export interface SubscriptionRecord {
  id: number;
  userId: number;
  familyId: number | null;
  serviceName: string;
  cost: number;
  currency: string;
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
    billingDate: record.billingDate,
    cancelUrl: record.cancelUrl,
    reason: record.reason,
    isShared: record.isShared,
    createdAt: record.createdAt.toISOString(),
    ownerName,
  };
}
