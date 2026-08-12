import type {
  ChecklistRepository,
  CreateChecklistInput,
  CreateChecklistItemInput,
  UpdateChecklistInput,
} from "./checklistRepository.js";
import type { ChecklistItemRecord, ChecklistRecord } from "./checklistTypes.js";

export class MemoryChecklistRepository implements ChecklistRepository {
  private lists = new Map<number, ChecklistRecord>();
  private items = new Map<number, ChecklistItemRecord>();
  private nextListId = 1;
  private nextItemId = 1;

  async findById(id: number): Promise<ChecklistRecord | null> {
    const row = this.lists.get(id);
    return row ? { ...row } : null;
  }

  async listForUser(userId: number, familyId: number | null): Promise<ChecklistRecord[]> {
    return [...this.lists.values()]
      .filter(
        (c) =>
          c.userId === userId ||
          (familyId !== null && c.familyId === familyId && c.isShared),
      )
      .map((c) => ({ ...c }))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async countItems(checklistId: number): Promise<number> {
    return [...this.items.values()].filter((i) => i.checklistId === checklistId).length;
  }

  async create(input: CreateChecklistInput): Promise<ChecklistRecord> {
    const now = new Date();
    const record: ChecklistRecord = {
      id: this.nextListId++,
      userId: input.userId,
      familyId: input.familyId,
      title: input.title,
      isShared: input.isShared,
      updatedAt: now,
      createdAt: now,
    };
    this.lists.set(record.id, record);
    return { ...record };
  }

  async update(id: number, input: UpdateChecklistInput): Promise<ChecklistRecord> {
    const existing = this.lists.get(id);
    if (!existing) throw Object.assign(new Error("checklist not found"), { code: "NOT_FOUND" });
    const updated: ChecklistRecord = {
      ...existing,
      title: input.title === undefined ? existing.title : input.title,
      isShared: input.isShared === undefined ? existing.isShared : input.isShared,
      familyId: input.familyId === undefined ? existing.familyId : input.familyId,
      updatedAt: new Date(),
    };
    this.lists.set(id, updated);
    return { ...updated };
  }

  async remove(id: number): Promise<boolean> {
    for (const [itemId, item] of this.items) {
      if (item.checklistId === id) this.items.delete(itemId);
    }
    return this.lists.delete(id);
  }

  async listItems(checklistId: number): Promise<ChecklistItemRecord[]> {
    return [...this.items.values()]
      .filter((i) => i.checklistId === checklistId)
      .map((i) => ({ ...i }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  }

  async findItemById(id: number): Promise<ChecklistItemRecord | null> {
    const row = this.items.get(id);
    return row ? { ...row } : null;
  }

  async createItem(input: CreateChecklistItemInput): Promise<ChecklistItemRecord> {
    const record: ChecklistItemRecord = {
      id: this.nextItemId++,
      checklistId: input.checklistId,
      parentId: input.parentId,
      title: input.title,
      sortOrder: input.sortOrder,
      createdAt: new Date(),
    };
    this.items.set(record.id, record);
    const list = this.lists.get(input.checklistId);
    if (list) {
      this.lists.set(input.checklistId, { ...list, updatedAt: new Date() });
    }
    return { ...record };
  }

  async removeItem(id: number): Promise<boolean> {
    return this.removeItemSubtree(id);
  }

  async removeItemSubtree(id: number): Promise<boolean> {
    const root = this.items.get(id);
    if (!root) return false;
    const checklistId = root.checklistId;
    const toDelete = new Set<number>();
    const walk = (itemId: number) => {
      toDelete.add(itemId);
      for (const item of this.items.values()) {
        if (item.parentId === itemId) walk(item.id);
      }
    };
    walk(id);
    for (const itemId of toDelete) this.items.delete(itemId);
    const list = this.lists.get(checklistId);
    if (list) {
      this.lists.set(checklistId, { ...list, updatedAt: new Date() });
    }
    return true;
  }
}
