import type { BillingInterval } from "./subscriptionTypes.js";
import type { RecurringDepositRecord } from "./recurringDepositTypes.js";

export interface CreateRecurringDepositInput {
  userId: number;
  familyId: number | null;
  assetId: number;
  label: string;
  amount: number;
  currency: string;
  billingInterval: BillingInterval;
  billingMonth: number | null;
  billingDate: number;
  isActive?: boolean;
}

export interface UpdateRecurringDepositInput {
  label?: string;
  amount?: number;
  billingInterval?: BillingInterval;
  billingMonth?: number | null;
  billingDate?: number;
  isActive?: boolean;
  lastAppliedOn?: Date | null;
}

export interface RecurringDepositRepository {
  findById(id: number): Promise<RecurringDepositRecord | null>;
  listForAsset(assetId: number): Promise<RecurringDepositRecord[]>;
  listActiveForUser(userId: number): Promise<RecurringDepositRecord[]>;
  create(input: CreateRecurringDepositInput): Promise<RecurringDepositRecord>;
  update(id: number, input: UpdateRecurringDepositInput): Promise<RecurringDepositRecord>;
  remove(id: number): Promise<boolean>;
}
