export type FamilyActivityEntityType =
  | "CALENDAR_EVENT"
  | "DOCUMENT"
  | "CHECKLIST"
  | "ASSET"
  | "SUBSCRIPTION";

export interface FamilyActivityRecord {
  id: number;
  familyId: number;
  actorUserId: number;
  entityType: FamilyActivityEntityType;
  entityId: number;
  title: string;
  createdAt: Date;
}

export interface CreateFamilyActivityInput {
  familyId: number;
  actorUserId: number;
  entityType: FamilyActivityEntityType;
  entityId: number;
  title: string;
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
    default:
      return "/";
  }
}
