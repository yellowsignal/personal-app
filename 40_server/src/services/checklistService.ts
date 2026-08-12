import type { AuthRepository } from "../domain/authRepository.js";
import type { ChecklistRepository } from "../domain/checklistRepository.js";
import {
  toPublicChecklist,
  toPublicItem,
  type PublicChecklist,
  type PublicChecklistDetail,
  type PublicChecklistItem,
  type ViewScope,
} from "../domain/checklistTypes.js";
import { HttpError } from "./authService.js";

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

  /** Owner, or family member on a shared list (tap-to-clear shopping style). */
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
      out.push(toPublicChecklist(record, ownerName, itemCount));
    }
    return out;
  }

  async list(userId: number, scopeRaw: unknown): Promise<PublicChecklist[]> {
    const user = await this.requireUser(userId);
    const scope = parseScope(scopeRaw);
    const records = await this.checklistRepo.listForUser(userId, user.familyId);
    const withMeta = await this.withMeta(records);
    return this.filterScope(withMeta, scope, userId);
  }

  async get(userId: number, id: number): Promise<PublicChecklistDetail> {
    const user = await this.requireUser(userId);
    const existing = await this.checklistRepo.findById(id);
    if (!existing) throw new HttpError(404, "checklist not found", "NOT_FOUND");
    if (!this.canView(existing, user.id, user.familyId)) {
      throw new HttpError(403, "forbidden", "FORBIDDEN");
    }
    const owner = await this.authRepo.findUserById(existing.userId);
    const items = await this.checklistRepo.listItems(id);
    return {
      ...toPublicChecklist(existing, owner?.name ?? "Unknown", items.length),
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
    return toPublicChecklist(record, user.name, 0);
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
    const itemCount = await this.checklistRepo.countItems(id);
    return toPublicChecklist(updated, user.name, itemCount);
  }

  async remove(userId: number, id: number): Promise<void> {
    const user = await this.requireUser(userId);
    const existing = await this.checklistRepo.findById(id);
    if (!existing) throw new HttpError(404, "checklist not found", "NOT_FOUND");
    if (existing.userId !== user.id) {
      throw new HttpError(403, "only the owner can delete this checklist", "FORBIDDEN");
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
