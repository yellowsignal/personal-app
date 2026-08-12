import type { PrismaClient, Transaction as PrismaTransaction } from "@prisma/client";
import type {
  CreateTransactionInput,
  TransactionRepository,
} from "./transactionRepository.js";
import type { TransactionCategory, TransactionRecord } from "./transactionTypes.js";

function map(row: PrismaTransaction): TransactionRecord {
  return {
    id: row.id,
    userId: row.userId,
    familyId: row.familyId,
    assetId: row.assetId,
    category: row.category as TransactionCategory,
    amount: Number(row.amount),
    currency: row.currency,
    date: row.date,
    description: row.description,
    balanceAfter: row.balanceAfter != null ? Number(row.balanceAfter) : null,
    isShared: row.isShared,
    createdAt: row.createdAt,
  };
}

export class PrismaTransactionRepository implements TransactionRepository {
  constructor(private readonly db: PrismaClient) {}

  async findById(id: number): Promise<TransactionRecord | null> {
    const row = await this.db.transaction.findUnique({ where: { id } });
    return row ? map(row) : null;
  }

  async listForAsset(assetId: number): Promise<TransactionRecord[]> {
    const rows = await this.db.transaction.findMany({
      where: { assetId },
      orderBy: [{ date: "desc" }, { id: "desc" }],
    });
    return rows.map(map);
  }

  async listForUser(userId: number, familyId: number | null): Promise<TransactionRecord[]> {
    const rows = await this.db.transaction.findMany({
      where: familyId
        ? { OR: [{ userId }, { familyId, isShared: true }] }
        : { userId },
      orderBy: [{ date: "desc" }, { id: "desc" }],
    });
    return rows.map(map);
  }

  async createMany(inputs: CreateTransactionInput[]): Promise<TransactionRecord[]> {
    if (inputs.length === 0) return [];
    const rows = await this.db.$transaction(
      inputs.map((input) =>
        this.db.transaction.create({
          data: {
            userId: input.userId,
            familyId: input.familyId,
            assetId: input.assetId,
            category: input.category,
            amount: input.amount,
            currency: input.currency,
            date: input.date,
            description: input.description,
            balanceAfter: input.balanceAfter,
            isShared: input.isShared,
          },
        }),
      ),
    );
    return rows.map(map);
  }

  async removeByAsset(assetId: number): Promise<number> {
    const result = await this.db.transaction.deleteMany({ where: { assetId } });
    return result.count;
  }

  async existsDuplicate(
    assetId: number,
    date: Date,
    amount: number,
    category: TransactionCategory,
    description: string | null,
  ): Promise<boolean> {
    const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    const count = await this.db.transaction.count({
      where: {
        assetId,
        category,
        amount,
        description: description ?? null,
        date: { gte: dayStart, lt: dayEnd },
      },
    });
    return count > 0;
  }
}
