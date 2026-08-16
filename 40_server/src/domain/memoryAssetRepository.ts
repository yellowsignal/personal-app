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
      bankCode: input.bankCode,
      accountNumber: input.accountNumber,
      loginPasswordCipher: input.loginPasswordCipher,
      institutionCode: input.institutionCode,
      institutionName: input.institutionName,
      branchCode: input.branchCode,
      branchName: input.branchName,
      stockMarket: input.stockMarket,
      stockCode: input.stockCode,
      quantity: input.quantity,
      buyPrice: input.buyPrice,
      currentPrice: input.currentPrice,
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
      bankCode: input.bankCode === undefined ? existing.bankCode : input.bankCode,
      accountNumber:
        input.accountNumber === undefined ? existing.accountNumber : input.accountNumber,
      loginPasswordCipher:
        input.loginPasswordCipher === undefined
          ? existing.loginPasswordCipher
          : input.loginPasswordCipher,
      institutionCode:
        input.institutionCode === undefined ? existing.institutionCode : input.institutionCode,
      institutionName:
        input.institutionName === undefined ? existing.institutionName : input.institutionName,
      branchCode: input.branchCode === undefined ? existing.branchCode : input.branchCode,
      branchName: input.branchName === undefined ? existing.branchName : input.branchName,
      stockMarket: input.stockMarket === undefined ? existing.stockMarket : input.stockMarket,
      stockCode: input.stockCode === undefined ? existing.stockCode : input.stockCode,
      quantity: input.quantity === undefined ? existing.quantity : input.quantity,
      buyPrice: input.buyPrice === undefined ? existing.buyPrice : input.buyPrice,
      currentPrice: input.currentPrice === undefined ? existing.currentPrice : input.currentPrice,
      updatedAt: new Date(),
    };
    this.items.set(id, updated);
    return { ...updated };
  }

  async remove(id: number): Promise<boolean> {
    return this.items.delete(id);
  }
}
