import type {
  CreateFamilyActivityInput,
  FamilyActivityRecord,
  FamilyActivityRepository,
} from "./familyActivityTypes.js";

export class MemoryFamilyActivityRepository implements FamilyActivityRepository {
  private nextId = 1;
  private rows: FamilyActivityRecord[] = [];
  private reads = new Set<string>();

  async create(input: CreateFamilyActivityInput): Promise<FamilyActivityRecord> {
    const row: FamilyActivityRecord = {
      id: this.nextId++,
      familyId: input.familyId,
      actorUserId: input.actorUserId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      title: input.title.slice(0, 200),
      detailJson: input.detailJson ?? null,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return { ...row };
  }

  async listForFamily(familyId: number, limit: number): Promise<FamilyActivityRecord[]> {
    return this.rows
      .filter((r) => r.familyId === familyId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, Math.max(1, Math.min(100, limit)))
      .map((r) => ({ ...r }));
  }

  async countUnreadForUser(familyId: number, userId: number): Promise<number> {
    return this.rows.filter(
      (r) => r.familyId === familyId && r.actorUserId !== userId && !this.reads.has(`${r.id}:${userId}`),
    ).length;
  }

  async listUnreadIdsForUser(familyId: number, userId: number): Promise<number[]> {
    return this.rows
      .filter((r) => r.familyId === familyId && r.actorUserId !== userId && !this.reads.has(`${r.id}:${userId}`))
      .map((r) => r.id);
  }

  async markRead(userId: number, activityIds: number[]): Promise<void> {
    for (const id of activityIds) this.reads.add(`${id}:${userId}`);
  }

  async markAllRead(familyId: number, userId: number): Promise<void> {
    for (const r of this.rows) {
      if (r.familyId === familyId && r.actorUserId !== userId) this.reads.add(`${r.id}:${userId}`);
    }
  }
}
