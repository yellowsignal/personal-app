import type {
  InviteTokenRecord,
  InviteTokenRepository,
} from "./passkeyTypes.js";

export class MemoryInviteTokenRepository implements InviteTokenRepository {
  private items = new Map<number, InviteTokenRecord>();
  private nextId = 1;

  async create(input: {
    familyId: number;
    tokenHash: string;
    expiresAt: Date;
    createdByUserId: number;
  }): Promise<InviteTokenRecord> {
    const record: InviteTokenRecord = {
      id: this.nextId++,
      familyId: input.familyId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
      usedByUserId: null,
      createdByUserId: input.createdByUserId,
      createdAt: new Date(),
    };
    this.items.set(record.id, record);
    return { ...record };
  }

  async findByTokenHash(tokenHash: string): Promise<InviteTokenRecord | null> {
    for (const item of this.items.values()) {
      if (item.tokenHash === tokenHash) return { ...item };
    }
    return null;
  }

  async markUsed(id: number, usedByUserId: number): Promise<InviteTokenRecord> {
    const item = this.items.get(id);
    if (!item) throw Object.assign(new Error("invite token not found"), { code: "NOT_FOUND" });
    const updated = { ...item, usedAt: new Date(), usedByUserId };
    this.items.set(id, updated);
    return { ...updated };
  }
}
