import type {
  CreateTransactionInput,
  TransactionRepository,
} from "./transactionRepository.js";
import type { TransactionCategory, TransactionRecord } from "./transactionTypes.js";

function dupKey(
  assetId: number,
  date: Date,
  amount: number,
  category: TransactionCategory,
  description: string | null,
): string {
  const day = date.toISOString().slice(0, 10);
  return `${assetId}|${day}|${category}|${amount}|${description ?? ""}`;
}

export class MemoryTransactionRepository implements TransactionRepository {
  private items = new Map<number, TransactionRecord>();
  private nextId = 1;

  async findById(id: number): Promise<TransactionRecord | null> {
    const item = this.items.get(id);
    return item ? { ...item, date: new Date(item.date) } : null;
  }

  async listForAsset(assetId: number): Promise<TransactionRecord[]> {
    return [...this.items.values()]
      .filter((t) => t.assetId === assetId)
      .map((t) => ({ ...t, date: new Date(t.date) }))
      .sort((a, b) => b.date.getTime() - a.date.getTime() || b.id - a.id);
  }

  async listForUser(userId: number, familyId: number | null): Promise<TransactionRecord[]> {
    return [...this.items.values()]
      .filter(
        (t) =>
          t.userId === userId ||
          (familyId !== null && t.familyId === familyId && t.isShared),
      )
      .map((t) => ({ ...t, date: new Date(t.date) }))
      .sort((a, b) => b.date.getTime() - a.date.getTime() || b.id - a.id);
  }

  async createMany(inputs: CreateTransactionInput[]): Promise<TransactionRecord[]> {
    const created: TransactionRecord[] = [];
    for (const input of inputs) {
      const record: TransactionRecord = {
        id: this.nextId++,
        userId: input.userId,
        familyId: input.familyId,
        assetId: input.assetId,
        category: input.category,
        amount: input.amount,
        currency: input.currency,
        date: new Date(input.date),
        description: input.description,
        balanceAfter: input.balanceAfter,
        isShared: input.isShared,
        createdAt: new Date(),
      };
      this.items.set(record.id, record);
      created.push({ ...record, date: new Date(record.date) });
    }
    return created;
  }

  async removeByAsset(assetId: number): Promise<number> {
    let n = 0;
    for (const [id, t] of this.items) {
      if (t.assetId === assetId) {
        this.items.delete(id);
        n++;
      }
    }
    return n;
  }

  async existsDuplicate(
    assetId: number,
    date: Date,
    amount: number,
    category: TransactionCategory,
    description: string | null,
  ): Promise<boolean> {
    const key = dupKey(assetId, date, amount, category, description);
    for (const t of this.items.values()) {
      if (t.assetId !== assetId) continue;
      if (dupKey(assetId, t.date, t.amount, t.category, t.description) === key) return true;
    }
    return false;
  }
}
