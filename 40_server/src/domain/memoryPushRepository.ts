import type { PushRepository, PushSubscriptionRecord, UpsertPushSubscriptionInput } from "./pushRepository.js";

export class MemoryPushRepository implements PushRepository {
  private rows = new Map<string, PushSubscriptionRecord>();
  private nextId = 1;

  async upsert(input: UpsertPushSubscriptionInput): Promise<PushSubscriptionRecord> {
    const existing = this.rows.get(input.endpoint);
    const record: PushSubscriptionRecord = {
      id: existing?.id ?? this.nextId++,
      userId: input.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent,
      createdAt: existing?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    this.rows.set(input.endpoint, record);
    return { ...record };
  }

  async listForUser(userId: number): Promise<PushSubscriptionRecord[]> {
    return [...this.rows.values()].filter((r) => r.userId === userId).map((r) => ({ ...r }));
  }

  async listForUsers(userIds: number[]): Promise<PushSubscriptionRecord[]> {
    const set = new Set(userIds);
    return [...this.rows.values()].filter((r) => set.has(r.userId)).map((r) => ({ ...r }));
  }

  async removeByEndpoint(endpoint: string): Promise<boolean> {
    return this.rows.delete(endpoint);
  }

  async removeForUserEndpoint(userId: number, endpoint: string): Promise<boolean> {
    const row = this.rows.get(endpoint);
    if (!row || row.userId !== userId) return false;
    return this.rows.delete(endpoint);
  }
}
