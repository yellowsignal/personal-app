export type FamilyActivityEntityType =
  | "CALENDAR_EVENT"
  | "DOCUMENT"
  | "CHECKLIST"
  | "ASSET"
  | "SUBSCRIPTION"
  | "PHOTO";

export type FamilyActivityAction = "CREATED" | "UPDATED" | "DELETED";

export interface FamilyActivityRecord {
  id: number;
  familyId: number;
  actorUserId: number;
  entityType: FamilyActivityEntityType;
  entityId: number;
  action: FamilyActivityAction;
  title: string;
  detailJson: string | null;
  createdAt: Date;
}

export interface CreateFamilyActivityInput {
  familyId: number;
  actorUserId: number;
  entityType: FamilyActivityEntityType;
  entityId: number;
  action: FamilyActivityAction;
  title: string;
  detailJson?: string | null;
}

export interface FamilyActivityRepository {
  create(input: CreateFamilyActivityInput): Promise<FamilyActivityRecord>;
  listForFamily(familyId: number, limit: number): Promise<FamilyActivityRecord[]>;
  countUnreadForUser(familyId: number, userId: number): Promise<number>;
  listUnreadIdsForUser(familyId: number, userId: number): Promise<number[]>;
  markRead(userId: number, activityIds: number[]): Promise<void>;
  markAllRead(familyId: number, userId: number): Promise<void>;
}

export function pathForEntity(type: FamilyActivityEntityType, entityId: number): string {
  switch (type) {
    case "CALENDAR_EVENT":
      return "/calendar";
    case "DOCUMENT":
      return `/documents?id=${entityId}`;
    case "CHECKLIST":
      return `/checklists?id=${entityId}`;
    case "ASSET":
      return `/assets?id=${entityId}`;
    case "SUBSCRIPTION":
      return `/subscriptions?id=${entityId}`;
    case "PHOTO":
      return `/photos?id=${entityId}`;
    default:
      return "/";
  }
}
