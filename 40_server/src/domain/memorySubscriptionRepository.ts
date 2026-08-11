import type {
  CreateSubscriptionInput,
  SubscriptionRepository,
  UpdateSubscriptionInput,
} from "./subscriptionRepository.js";
import type { SubscriptionRecord } from "./subscriptionTypes.js";

export class MemorySubscriptionRepository implements SubscriptionRepository {
  private items = new Map<number, SubscriptionRecord>();
  private nextId = 1;

  async findById(id: number): Promise<SubscriptionRecord | null> {
    const item = this.items.get(id);
    return item ? { ...item } : null;
  }

  async listForUser(userId: number, familyId: number | null): Promise<SubscriptionRecord[]> {
    return [...this.items.values()]
      .filter(
        (s) =>
          s.userId === userId ||
          (familyId !== null && s.familyId === familyId && s.isShared),
      )
      .map((s) => ({ ...s }))
      .sort((a, b) => a.billingDate - b.billingDate);
  }

  async create(input: CreateSubscriptionInput): Promise<SubscriptionRecord> {
    const record: SubscriptionRecord = {
      id: this.nextId++,
      userId: input.userId,
      familyId: input.familyId,
      serviceName: input.serviceName,
      cost: input.cost,
      currency: input.currency,
      billingDate: input.billingDate,
      cancelUrl: input.cancelUrl,
      reason: input.reason,
      isShared: input.isShared,
      createdAt: new Date(),
    };
    this.items.set(record.id, record);
    return { ...record };
  }

  async update(id: number, input: UpdateSubscriptionInput): Promise<SubscriptionRecord> {
    const existing = this.items.get(id);
    if (!existing) throw Object.assign(new Error("subscription not found"), { code: "NOT_FOUND" });
    const updated: SubscriptionRecord = {
      ...existing,
      ...input,
      cancelUrl: input.cancelUrl === undefined ? existing.cancelUrl : input.cancelUrl,
      reason: input.reason === undefined ? existing.reason : input.reason,
    };
    this.items.set(id, updated);
    return { ...updated };
  }

  async remove(id: number): Promise<boolean> {
    return this.items.delete(id);
  }
}
