import type { ChecklistItemRecord, ChecklistRecord } from "./checklistTypes.js";

export interface CreateChecklistInput {
  userId: number;
  familyId: number | null;
  title: string;
  isShared: boolean;
}

export interface UpdateChecklistInput {
  title?: string;
  isShared?: boolean;
  familyId?: number | null;
}

export interface CreateChecklistItemInput {
  checklistId: number;
  parentId: number | null;
  title: string;
  sortOrder: number;
}

export interface ChecklistRepository {
  findById(id: number): Promise<ChecklistRecord | null>;
  listForUser(userId: number, familyId: number | null): Promise<ChecklistRecord[]>;
  countItems(checklistId: number): Promise<number>;
  create(input: CreateChecklistInput): Promise<ChecklistRecord>;
  update(id: number, input: UpdateChecklistInput): Promise<ChecklistRecord>;
  remove(id: number): Promise<boolean>;

  listItems(checklistId: number): Promise<ChecklistItemRecord[]>;
  findItemById(id: number): Promise<ChecklistItemRecord | null>;
  createItem(input: CreateChecklistItemInput): Promise<ChecklistItemRecord>;
  removeItem(id: number): Promise<boolean>;
  /** Remove item and all descendants (for memory store / when DB cascade unavailable). */
  removeItemSubtree(id: number): Promise<boolean>;
}
