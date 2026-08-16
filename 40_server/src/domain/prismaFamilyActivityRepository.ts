import type { PrismaClient } from "@prisma/client";
import type {
  CreateFamilyActivityInput,
  FamilyActivityAction,
  FamilyActivityEntityType,
  FamilyActivityRecord,
  FamilyActivityRepository,
} from "./familyActivityTypes.js";

function mapRow(row: {
  id: number;
  familyId: number;
  actorUserId: number;
  entityType: FamilyActivityEntityType;
  entityId: number;
  action: FamilyActivityAction;
  title: string;
  detailJson: string | null;
  createdAt: Date;
}): FamilyActivityRecord {
  return {
    id: row.id,
    familyId: row.familyId,
    actorUserId: row.actorUserId,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    title: row.title,
    detailJson: row.detailJson,
    createdAt: row.createdAt,
  };
}

export class PrismaFamilyActivityRepository implements FamilyActivityRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(input: CreateFamilyActivityInput): Promise<FamilyActivityRecord> {
    const row = await this.db.familyActivity.create({
      data: {
        familyId: input.familyId,
        actorUserId: input.actorUserId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        title: input.title.slice(0, 200),
        detailJson: input.detailJson ?? null,
      },
    });
    return mapRow(row);
  }

  async listForFamily(familyId: number, limit: number): Promise<FamilyActivityRecord[]> {
    const rows = await this.db.familyActivity.findMany({
      where: { familyId },
      orderBy: { createdAt: "desc" },
      take: Math.max(1, Math.min(100, limit)),
    });
    return rows.map(mapRow);
  }

  async countUnreadForUser(familyId: number, userId: number): Promise<number> {
    return this.db.familyActivity.count({
      where: {
        familyId,
        actorUserId: { not: userId },
        reads: { none: { userId } },
      },
    });
  }

  async listUnreadIdsForUser(familyId: number, userId: number): Promise<number[]> {
    const rows = await this.db.familyActivity.findMany({
      where: {
        familyId,
        actorUserId: { not: userId },
        reads: { none: { userId } },
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async markRead(userId: number, activityIds: number[]): Promise<void> {
    if (!activityIds.length) return;
    await this.db.familyActivityRead.createMany({
      data: activityIds.map((activityId) => ({ activityId, userId })),
      skipDuplicates: true,
    });
  }

  async markAllRead(familyId: number, userId: number): Promise<void> {
    const ids = await this.listUnreadIdsForUser(familyId, userId);
    await this.markRead(userId, ids);
  }
}
