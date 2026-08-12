import type { TransactionCategory, TransactionRecord } from "./transactionTypes.js";

export interface CreateTransactionInput {
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
}

export interface TransactionRepository {
  findById(id: number): Promise<TransactionRecord | null>;
  listForAsset(assetId: number): Promise<TransactionRecord[]>;
  listForUser(userId: number, familyId: number | null): Promise<TransactionRecord[]>;
  createMany(inputs: CreateTransactionInput[]): Promise<TransactionRecord[]>;
  removeByAsset(assetId: number): Promise<number>;
  existsDuplicate(
    assetId: number,
    date: Date,
    amount: number,
    category: TransactionCategory,
    description: string | null,
  ): Promise<boolean>;
}
