import type {
  CreateRecurringDepositInput,
  RecurringDepositRepository,
  UpdateRecurringDepositInput,
} from "./recurringDepositRepository.js";
import type { RecurringDepositRecord } from "./recurringDepositTypes.js";

export class MemoryRecurringDepositRepository implements RecurringDepositRepository {
  private rows = new Map<number, RecurringDepositRecord>();
  private nextId = 1;

  async findById(id: number): Promise<RecurringDepositRecord | null> {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async listForAsset(assetId: number): Promise<RecurringDepositRecord[]> {
    return [...this.rows.values()]
      .filter((r) => r.assetId === assetId)
      .map((r) => ({ ...r }))
      .sort((a, b) => a.id - b.id);
  }

  async listActiveForUser(userId: number): Promise<RecurringDepositRecord[]> {
    return [...this.rows.values()]
      .filter((r) => r.userId === userId && r.isActive)
      .map((r) => ({ ...r }));
  }

  async create(input: CreateRecurringDepositInput): Promise<RecurringDepositRecord> {
    const now = new Date();
    const record: RecurringDepositRecord = {
      id: this.nextId++,
      userId: input.userId,
      familyId: input.familyId,
      assetId: input.assetId,
      label: input.label,
      amount: input.amount,
      currency: input.currency,
      billingInterval: input.billingInterval,
      billingMonth: input.billingMonth,
      billingDate: input.billingDate,
      isActive: input.isActive ?? true,
      lastAppliedOn: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(record.id, record);
    return { ...record };
  }

  async update(id: number, input: UpdateRecurringDepositInput): Promise<RecurringDepositRecord> {
    const existing = this.rows.get(id);
    if (!existing) throw Object.assign(new Error("not found"), { code: "NOT_FOUND" });
    const updated: RecurringDepositRecord = {
      ...existing,
      label: input.label === undefined ? existing.label : input.label,
      amount: input.amount === undefined ? existing.amount : input.amount,
      billingInterval: input.billingInterval === undefined ? existing.billingInterval : input.billingInterval,
      billingMonth: input.billingMonth === undefined ? existing.billingMonth : input.billingMonth,
      billingDate: input.billingDate === undefined ? existing.billingDate : input.billingDate,
      isActive: input.isActive === undefined ? existing.isActive : input.isActive,
      lastAppliedOn: input.lastAppliedOn === undefined ? existing.lastAppliedOn : input.lastAppliedOn,
      updatedAt: new Date(),
    };
    this.rows.set(id, updated);
    return { ...updated };
  }

  async remove(id: number): Promise<boolean> {
    return this.rows.delete(id);
  }
}
