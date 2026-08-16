import type { AuthRepository } from "../domain/authRepository.js";
import type { ChecklistRepository } from "../domain/checklistRepository.js";
import {
  CHECKLIST_COMPLETED_RETENTION_MS,
  toPublicChecklist,
  toPublicItem,
  type PublicChecklist,
  type PublicChecklistDetail,
  type PublicChecklistItem,
  type ChecklistItemRecord,
  type ViewScope,
} from "../domain/checklistTypes.js";
import { HttpError } from "./authService.js";
import type { FamilyActivityService } from "./familyActivityService.js";
import { collectChanges } from "../domain/familyActivityFormat.js";

function parseScope(value: unknown): ViewScope {
  if (value === "personal" || value === "family" || value === "all") return value;
  return "all";
}

function parseTitle(value: unknown, maxLen: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, "title is required");
  }
  return value.trim().slice(0, maxLen);
}

export class ChecklistService {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly checklistRepo: ChecklistRepository,
    private readonly activityService: FamilyActivityService | null = null,
  ) {}

  private async requireUser(userId: number) {
    const user = await this.authRepo.findUserById(userId);
    if (!user) throw new HttpError(401, "unauthorized", "UNAUTHORIZED");
    return user;
  }

  private canView(
    record: { userId: number; familyId: number | null; isShared: boolean },
    userId: number,
    familyId: number | null,
  ): boolean {
    if (record.userId === userId) return true;
    return Boolean(
      record.isShared && familyId !== null && record.familyId !== null && record.familyId === familyId,
    );
  }

  /** Owner, or family member on a shared list. */
  private canModifyItems(
    record: { userId: number; familyId: number | null; isShared: boolean },
    userId: number,
    familyId: number | null,
  ): boolean {
    if (record.userId === userId) return true;
    return Boolean(
      record.isShared && familyId !== null && record.familyId !== null && record.familyId === familyId,
    );
  }

  private filterScope(items: PublicChecklist[], scope: ViewScope, userId: number): PublicChecklist[] {
    if (scope === "personal") return items.filter((c) => Number(c.userId) === Number(userId));
    if (scope === "family") return items.filter((c) => c.isShared);
    return items;
  }

  /** Drop completed items older than retention window (lazy cleanup, no cron). */
  private async purgeExpiredCompleted(): Promise<void> {
    const cutoff = new Date(Date.now() - CHECKLIST_COMPLETED_RETENTION_MS);
    await this.checklistRepo.purgeCompletedBefore(cutoff);
  }

  private async withMeta(
    records: Awaited<ReturnType<ChecklistRepository["listForUser"]>>,
  ): Promise<PublicChecklist[]> {
    const nameCache = new Map<number, string>();
    const out: PublicChecklist[] = [];
    for (const record of records) {
      let ownerName = nameCache.get(record.userId);
      if (!ownerName) {
        const owner = await this.authRepo.findUserById(record.userId);
        ownerName = owner?.name ?? "Unknown";
        nameCache.set(record.userId, ownerName);
      }
      const itemCount = await this.checklistRepo.countItems(record.id);
      const completedCount = await this.checklistRepo.countCompletedItems(record.id);
      out.push(toPublicChecklist(record, ownerName, itemCount, completedCount));
    }
    return out;
  }

  async list(userId: number, scopeRaw: unknown): Promise<PublicChecklist[]> {
    const user = await this.requireUser(userId);
    await this.purgeExpiredCompleted();
    const scope = parseScope(scopeRaw);
    const records = await this.checklistRepo.listForUser(userId, user.familyId);
    const withMeta = await this.withMeta(records);
    return this.filterScope(withMeta, scope, userId);
  }

  async get(userId: number, id: number): Promise<PublicChecklistDetail> {
    const user = await this.requireUser(userId);
    await this.purgeExpiredCompleted();
    const existing = await this.checklistRepo.findById(id);
    if (!existing) throw new HttpError(404, "checklist not found", "NOT_FOUND");
    if (!this.canView(existing, user.id, user.familyId)) {
      throw new HttpError(403, "forbidden", "FORBIDDEN");
    }
    const owner = await this.authRepo.findUserById(existing.userId);
    const items = await this.checklistRepo.listItems(id);
    return {
      ...toPublicChecklist(
        existing,
        owner?.name ?? "Unknown",
        items.length,
        items.filter((i) => i.completedAt !== null).length,
      ),
      items: items.map(toPublicItem),
    };
  }

  async create(userId: number, body: Record<string, unknown>): Promise<PublicChecklist> {
    const user = await this.requireUser(userId);
    const title = parseTitle(body.title, 200);
    const isShared = body.isShared === true;
    if (isShared && !user.familyId) {
      throw new HttpError(400, "join a family before sharing checklists", "NO_FAMILY");
    }
    const record = await this.checklistRepo.create({
      userId: user.id,
      familyId: user.familyId,
      title,
      isShared,
    });
    if (isShared) {
      await this.activityService?.recordSharedCreate({
        familyId: record.familyId,
        actorUserId: user.id,
        actorName: user.name,
        entityType: "CHECKLIST",
        entityId: record.id,
        title: record.title,
      });
    }
    return toPublicChecklist(record, user.name, 0, 0);
  }

  async update(userId: number, id: number, body: Record<string, unknown>): Promise<PublicChecklist> {
    const user = await this.requireUser(userId);
    const existing = await this.checklistRepo.findById(id);
    if (!existing) throw new HttpError(404, "checklist not found", "NOT_FOUND");
    if (existing.userId !== user.id) {
      throw new HttpError(403, "only the owner can edit this checklist", "FORBIDDEN");
    }
    const isShared = body.isShared === undefined ? existing.isShared : body.isShared === true;
    if (isShared && !user.familyId) {
      throw new HttpError(400, "join a family before sharing checklists", "NO_FAMILY");
    }
    const updated = await this.checklistRepo.update(id, {
      title:
        typeof body.title === "string" && body.title.trim()
          ? body.title.trim().slice(0, 200)
          : undefined,
      isShared: body.isShared === undefined ? undefined : isShared,
      familyId: user.familyId,
    });
    if (user.familyId && (updated.isShared || existing.isShared)) {
      const changes = collectChanges([
        { field: "title", from: existing.title, to: updated.title },
        {
          field: "shared",
          from: existing.isShared ? "on" : "off",
          to: updated.isShared ? "on" : "off",
        },
      ]);
      if (changes.length > 0) {
        await this.activityService?.recordActivity({
          familyId: user.familyId,
          actorUserId: user.id,
          actorName: user.name,
          entityType: "CHECKLIST",
          entityId: updated.id,
          action: "UPDATED",
          title: updated.title,
          detail: { changes },
        });
      }
    }
    const itemCount = await this.checklistRepo.countItems(id);
    const completedCount = await this.checklistRepo.countCompletedItems(id);
    return toPublicChecklist(updated, user.name, itemCount, completedCount);
  }

  async remove(userId: number, id: number): Promise<void> {
    const user = await this.requireUser(userId);
    const existing = await this.checklistRepo.findById(id);
    if (!existing) throw new HttpError(404, "checklist not found", "NOT_FOUND");
    if (existing.userId !== user.id) {
      throw new HttpError(403, "only the owner can delete this checklist", "FORBIDDEN");
    }
    if (existing.isShared && user.familyId) {
      await this.activityService?.recordActivity({
        familyId: user.familyId,
        actorUserId: user.id,
        actorName: user.name,
        entityType: "CHECKLIST",
        entityId: existing.id,
        action: "DELETED",
        title: existing.title,
      });
    }
    await this.checklistRepo.remove(id);
  }

  async addItem(
    userId: number,
    checklistId: number,
    body: Record<string, unknown>,
  ): Promise<PublicChecklistItem> {
    const user = await this.requireUser(userId);
    const list = await this.checklistRepo.findById(checklistId);
    if (!list) throw new HttpError(404, "checklist not found", "NOT_FOUND");
    if (!this.canModifyItems(list, user.id, user.familyId)) {
      throw new HttpError(403, "forbidden", "FORBIDDEN");
    }
    const title = parseTitle(body.title, 300);
    let parentId: number | null = null;
    if (body.parentId !== undefined && body.parentId !== null) {
      const pid = Number(body.parentId);
      if (!Number.isFinite(pid)) throw new HttpError(400, "invalid parentId");
      const parent = await this.checklistRepo.findItemById(pid);
      if (!parent || parent.checklistId !== checklistId) {
        throw new HttpError(400, "parent item not found in this checklist");
      }
      parentId = pid;
    }
    const siblings = (await this.checklistRepo.listItems(checklistId)).filter(
      (i) => i.parentId === parentId,
    );
    const sortOrder = siblings.length === 0 ? 0 : Math.max(...siblings.map((s) => s.sortOrder)) + 1;
    const item = await this.checklistRepo.createItem({
      checklistId,
      parentId,
      title,
      sortOrder,
    });
    return toPublicItem(item);
  }

  async updateItem(
    userId: number,
    checklistId: number,
    itemId: number,
    body: Record<string, unknown>,
  ): Promise<PublicChecklistItem> {
    const user = await this.requireUser(userId);
    const list = await this.checklistRepo.findById(checklistId);
    if (!list) throw new HttpError(404, "checklist not found", "NOT_FOUND");
    if (!this.canModifyItems(list, user.id, user.familyId)) {
      throw new HttpError(403, "forbidden", "FORBIDDEN");
    }
    const item = await this.checklistRepo.findItemById(itemId);
    if (!item || item.checklistId !== checklistId) {
      throw new HttpError(404, "item not found", "NOT_FOUND");
    }

    let title: string | undefined;
    if ("title" in body) {
      title = parseTitle(body.title, 300);
    }

    let completedAt: Date | null | undefined;
    if ("completed" in body) {
      if (typeof body.completed !== "boolean") {
        throw new HttpError(400, "completed must be a boolean");
      }
      completedAt = body.completed ? new Date() : null;
    }

    if (title === undefined && completedAt === undefined) {
      throw new HttpError(400, "title or completed is required");
    }

    if (completedAt !== undefined && completedAt !== null) {
      // Rule: an item can be marked completed only if all of its descendants are completed.
      const allItems = await this.checklistRepo.listItems(checklistId);
      const idMap = new Map<number, ChecklistItemRecord>();
      const childrenByParent = new Map<number | null, number[]>();

      for (const it of allItems) {
        idMap.set(it.id, it);
        const key = it.parentId ?? null;
        const arr = childrenByParent.get(key);
        if (arr) arr.push(it.id);
        else childrenByParent.set(key, [it.id]);
      }

      const queue: number[] = [...(childrenByParent.get(itemId) ?? [])];
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        const current = idMap.get(currentId);
        if (!current) continue;
        if (!current.completedAt) {
          throw new HttpError(400, "child items must be completed first", "CHILD_INCOMPLETE");
        }
        queue.push(...(childrenByParent.get(currentId) ?? []));
      }
    }

    const updated = await this.checklistRepo.updateItem(itemId, { title, completedAt });
    return toPublicItem(updated);
  }

  async removeItem(userId: number, checklistId: number, itemId: number): Promise<void> {
    const user = await this.requireUser(userId);
    const list = await this.checklistRepo.findById(checklistId);
    if (!list) throw new HttpError(404, "checklist not found", "NOT_FOUND");
    if (!this.canModifyItems(list, user.id, user.familyId)) {
      throw new HttpError(403, "forbidden", "FORBIDDEN");
    }
    const item = await this.checklistRepo.findItemById(itemId);
    if (!item || item.checklistId !== checklistId) {
      throw new HttpError(404, "item not found", "NOT_FOUND");
    }
    await this.checklistRepo.removeItemSubtree(itemId);
  }
}
