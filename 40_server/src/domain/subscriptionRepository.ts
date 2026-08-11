import type { BillingInterval, SubscriptionRecord } from "./subscriptionTypes.js";

export interface CreateSubscriptionInput {
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
}

export interface UpdateSubscriptionInput {
  serviceName?: string;
  cost?: number;
  currency?: string;
  billingInterval?: BillingInterval;
  billingMonth?: number | null;
  billingDate?: number;
  cancelUrl?: string | null;
  reason?: string | null;
  isShared?: boolean;
}

export interface SubscriptionRepository {
  findById(id: number): Promise<SubscriptionRecord | null>;
  listForUser(userId: number, familyId: number | null): Promise<SubscriptionRecord[]>;
  create(input: CreateSubscriptionInput): Promise<SubscriptionRecord>;
  update(id: number, input: UpdateSubscriptionInput): Promise<SubscriptionRecord>;
  remove(id: number): Promise<boolean>;
}
