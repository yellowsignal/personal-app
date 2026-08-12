import type { ViewScope } from "./assetTypes.js";

export type TransactionCategory = "credit" | "debit";

export interface TransactionRecord {
  id: number;
  userId: number;
  familyId: number | null;
  assetId: number | null;
  category: TransactionCategory;
  amount: number;
  currency: string;
  date: Date;
  description: string | null;
  balanceAfter: number | null;
  isShared: boolean;
  createdAt: Date;
}

export interface PublicTransaction {
  id: number;
  userId: number;
  assetId: number | null;
  category: TransactionCategory;
  amount: number;
  currency: string;
  date: string;
  description: string | null;
  balanceAfter: number | null;
  isShared: boolean;
  ownerName: string;
}

export function toPublicTransaction(record: TransactionRecord, ownerName: string): PublicTransaction {
  const date =
    record.date instanceof Date
      ? record.date.toISOString().slice(0, 10)
      : String(record.date).slice(0, 10);
  return {
    id: record.id,
    userId: record.userId,
    assetId: record.assetId,
    category: record.category,
    amount: record.amount,
    currency: record.currency,
    date,
    description: record.description,
    balanceAfter: record.balanceAfter,
    isShared: record.isShared,
    ownerName,
  };
}

export type { ViewScope };
