import type {
  CreateAssetInput,
  AssetRepository,
  UpdateAssetInput,
} from "./assetRepository.js";
import type { AssetRecord } from "./assetTypes.js";

export class MemoryAssetRepository implements AssetRepository {
  private items = new Map<number, AssetRecord>();
  private nextId = 1;

  async findById(id: number): Promise<AssetRecord | null> {
    const item = this.items.get(id);
    return item ? { ...item } : null;
  }

  async listForUser(userId: number, familyId: number | null): Promise<AssetRecord[]> {
    return [...this.items.values()]
      .filter(
        (a) =>
          a.userId === userId ||
          (familyId !== null && a.familyId === familyId && a.isShared),
      )
      .map((a) => ({ ...a }))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async create(input: CreateAssetInput): Promise<AssetRecord> {
    const now = new Date();
    const record: AssetRecord = {
      id: this.nextId++,
      userId: input.userId,
      familyId: input.familyId,
      type: input.type,
      label: input.label,
      currency: input.currency,
      amount: input.amount,
      stockCode: input.stockCode,
      buyPrice: input.buyPrice,
      isShared: input.isShared,
      updatedAt: now,
      createdAt: now,
    };
    this.items.set(record.id, record);
    return { ...record };
  }

  async update(id: number, input: UpdateAssetInput): Promise<AssetRecord> {
    const existing = this.items.get(id);
    if (!existing) throw Object.assign(new Error("asset not found"), { code: "NOT_FOUND" });
    const updated: AssetRecord = {
      ...existing,
      ...input,
      stockCode: input.stockCode === undefined ? existing.stockCode : input.stockCode,
      buyPrice: input.buyPrice === undefined ? existing.buyPrice : input.buyPrice,
      updatedAt: new Date(),
    };
    this.items.set(id, updated);
    return { ...updated };
  }

  async remove(id: number): Promise<boolean> {
    return this.items.delete(id);
  }
}
