export type ViewScope = "all" | "personal" | "family";

/** Completed items older than this are removed on list/get. */
export const CHECKLIST_COMPLETED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface ChecklistRecord {
  id: number;
  userId: number;
  familyId: number | null;
  title: string;
  isShared: boolean;
  updatedAt: Date;
  createdAt: Date;
}

export interface ChecklistItemRecord {
  id: number;
  checklistId: number;
  parentId: number | null;
  title: string;
  sortOrder: number;
  completedAt: Date | null;
  createdAt: Date;
}

export interface PublicChecklistItem {
  id: number;
  checklistId: number;
  parentId: number | null;
  title: string;
  sortOrder: number;
  completedAt: string | null;
  createdAt: string;
}

export interface PublicChecklist {
  id: number;
  userId: number;
  familyId: number | null;
  title: string;
  isShared: boolean;
  updatedAt: string;
  createdAt: string;
  ownerName: string;
  itemCount: number;
}

export interface PublicChecklistDetail extends PublicChecklist {
  items: PublicChecklistItem[];
}

export function toPublicItem(record: ChecklistItemRecord): PublicChecklistItem {
  return {
    id: record.id,
    checklistId: record.checklistId,
    parentId: record.parentId,
    title: record.title,
    sortOrder: record.sortOrder,
    completedAt: record.completedAt ? record.completedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toPublicChecklist(
  record: ChecklistRecord,
  ownerName: string,
  itemCount: number,
): PublicChecklist {
  return {
    id: record.id,
    userId: record.userId,
    familyId: record.familyId,
    title: record.title,
    isShared: record.isShared,
    updatedAt: record.updatedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    ownerName,
    itemCount,
  };
}
