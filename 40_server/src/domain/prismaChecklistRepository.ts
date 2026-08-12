import type {
  PrismaClient,
  Checklist as PrismaChecklist,
  ChecklistItem as PrismaChecklistItem,
} from "@prisma/client";
import type {
  ChecklistRepository,
  CreateChecklistInput,
  CreateChecklistItemInput,
  UpdateChecklistInput,
} from "./checklistRepository.js";
import type { ChecklistItemRecord, ChecklistRecord } from "./checklistTypes.js";

function mapList(row: PrismaChecklist): ChecklistRecord {
  return {
    id: row.id,
    userId: row.userId,
    familyId: row.familyId,
    title: row.title,
    isShared: row.isShared,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  };
}

function mapItem(row: PrismaChecklistItem): ChecklistItemRecord {
  return {
    id: row.id,
    checklistId: row.checklistId,
    parentId: row.parentId,
    title: row.title,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  };
}

export class PrismaChecklistRepository implements ChecklistRepository {
  constructor(private readonly db: PrismaClient) {}

  async findById(id: number): Promise<ChecklistRecord | null> {
    const row = await this.db.checklist.findUnique({ where: { id } });
    return row ? mapList(row) : null;
  }

  async listForUser(userId: number, familyId: number | null): Promise<ChecklistRecord[]> {
    const rows = await this.db.checklist.findMany({
      where: familyId
        ? { OR: [{ userId }, { familyId, isShared: true }] }
        : { userId },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(mapList);
  }

  async countItems(checklistId: number): Promise<number> {
    return this.db.checklistItem.count({ where: { checklistId } });
  }

  async create(input: CreateChecklistInput): Promise<ChecklistRecord> {
    const row = await this.db.checklist.create({
      data: {
        userId: input.userId,
        familyId: input.familyId,
        title: input.title,
        isShared: input.isShared,
      },
    });
    return mapList(row);
  }

  async update(id: number, input: UpdateChecklistInput): Promise<ChecklistRecord> {
    const row = await this.db.checklist.update({
      where: { id },
      data: {
        title: input.title,
        isShared: input.isShared,
        familyId: input.familyId,
      },
    });
    return mapList(row);
  }

  async remove(id: number): Promise<boolean> {
    try {
      await this.db.checklist.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  async listItems(checklistId: number): Promise<ChecklistItemRecord[]> {
    const rows = await this.db.checklistItem.findMany({
      where: { checklistId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    return rows.map(mapItem);
  }

  async findItemById(id: number): Promise<ChecklistItemRecord | null> {
    const row = await this.db.checklistItem.findUnique({ where: { id } });
    return row ? mapItem(row) : null;
  }

  async createItem(input: CreateChecklistItemInput): Promise<ChecklistItemRecord> {
    const row = await this.db.checklistItem.create({
      data: {
        checklistId: input.checklistId,
        parentId: input.parentId,
        title: input.title,
        sortOrder: input.sortOrder,
      },
    });
    await this.db.checklist.update({
      where: { id: input.checklistId },
      data: { updatedAt: new Date() },
    });
    return mapItem(row);
  }

  async removeItem(id: number): Promise<boolean> {
    return this.removeItemSubtree(id);
  }

  async removeItemSubtree(id: number): Promise<boolean> {
    const existing = await this.db.checklistItem.findUnique({ where: { id } });
    if (!existing) return false;
    // DB ON DELETE CASCADE removes descendants when parent is deleted.
    await this.db.checklistItem.delete({ where: { id } });
    await this.db.checklist.update({
      where: { id: existing.checklistId },
      data: { updatedAt: new Date() },
    });
    return true;
  }
}
