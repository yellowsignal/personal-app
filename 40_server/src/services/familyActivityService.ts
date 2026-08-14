import type { AuthRepository } from "../domain/authRepository.js";
import type {
  FamilyActivityEntityType,
  FamilyActivityRecord,
  FamilyActivityRepository,
} from "../domain/familyActivityTypes.js";
import { pathForEntity } from "../domain/familyActivityTypes.js";
import { HttpError } from "./authService.js";
import type { PushService } from "./pushService.js";

export interface PublicFamilyActivity {
  id: number;
  actorUserId: number;
  actorName: string;
  entityType: FamilyActivityEntityType;
  entityId: number;
  title: string;
  path: string;
  createdAt: string;
  isRead: boolean;
}

export interface FamilyActivitySummary {
  unreadCount: number;
  latest: PublicFamilyActivity | null;
}

function pushCopy(
  lang: string,
  actorName: string,
  entityType: FamilyActivityEntityType,
  title: string,
): { title: string; body: string } {
  const ja = lang === "ja";
  const kind = (() => {
    switch (entityType) {
      case "CALENDAR_EVENT":
        return ja ? "家族の予定" : "가족 일정";
      case "DOCUMENT":
        return ja ? "家族の書類" : "가족 문서";
      case "CHECKLIST":
        return ja ? "家族のチェックリスト" : "가족 체크리스트";
      case "ASSET":
        return ja ? "家族の資産" : "가족 자산";
      case "SUBSCRIPTION":
        return ja ? "家族のサブスク" : "가족 구독";
      default:
        return ja ? "家族の共有" : "가족 공유";
    }
  })();
  return {
    title: ja ? `${actorName}さんが共有しました` : `${actorName}님이 공유했어요`,
    body: `${kind} · ${title}`,
  };
}

export class FamilyActivityService {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly activityRepo: FamilyActivityRepository,
    private readonly pushService: PushService | null = null,
  ) {}

  private async requireUser(userId: number) {
    const user = await this.authRepo.findUserById(userId);
    if (!user) throw new HttpError(401, "unauthorized", "UNAUTHORIZED");
    return user;
  }

  /**
   * Record a shared create and notify other family members.
   * Best-effort: never throws — callers (calendar/assets/…) must not fail the primary create
   * if the activity feed or push side-effect breaks (missing table, Prisma error, etc.).
   */
  async recordSharedCreate(input: {
    familyId: number | null | undefined;
    actorUserId: number;
    actorName: string;
    entityType: FamilyActivityEntityType;
    entityId: number;
    title: string;
  }): Promise<void> {
    if (input.familyId == null) return;
    const title = input.title.trim().slice(0, 200) || "(untitled)";
    try {
      const activity = await this.activityRepo.create({
        familyId: input.familyId,
        actorUserId: input.actorUserId,
        entityType: input.entityType,
        entityId: input.entityId,
        title,
      });

      if (!this.pushService) return;
      try {
        const members = await this.authRepo.listFamilyMembers(input.familyId);
        const recipients = members.filter((m) => m.id !== input.actorUserId);
        for (const member of recipients) {
          const unreadCount = await this.activityRepo.countUnreadForUser(input.familyId, member.id);
          const copy = pushCopy(member.languagePref, input.actorName, input.entityType, title);
          await this.pushService.sendToUsers([member.id], {
            title: copy.title,
            body: copy.body,
            url: "/",
            tag: `family-activity-${activity.id}`,
            unreadCount,
          });
        }
      } catch (err) {
        console.error("[family-activity] push failed", err);
      }
    } catch (err) {
      console.error("[family-activity] recordSharedCreate failed", err);
    }
  }

  async summary(userId: number): Promise<FamilyActivitySummary> {
    const user = await this.requireUser(userId);
    if (!user.familyId) return { unreadCount: 0, latest: null };
    const unreadCount = await this.activityRepo.countUnreadForUser(user.familyId, user.id);
    const list = await this.list(userId, 1);
    return { unreadCount, latest: list[0] ?? null };
  }

  async list(userId: number, limit = 30): Promise<PublicFamilyActivity[]> {
    const user = await this.requireUser(userId);
    if (!user.familyId) return [];
    const rows = await this.activityRepo.listForFamily(user.familyId, limit);
    const unreadIds = new Set(await this.activityRepo.listUnreadIdsForUser(user.familyId, user.id));
    const out: PublicFamilyActivity[] = [];
    for (const row of rows) {
      if (row.actorUserId === user.id) {
        // Still show own shares in the feed, always "read"
        out.push(await this.toPublic(row, true));
        continue;
      }
      out.push(await this.toPublic(row, !unreadIds.has(row.id)));
    }
    return out;
  }

  async markRead(userId: number, body: Record<string, unknown>): Promise<{ unreadCount: number }> {
    const user = await this.requireUser(userId);
    if (!user.familyId) return { unreadCount: 0 };
    if (body.all === true) {
      await this.activityRepo.markAllRead(user.familyId, user.id);
    } else if (Array.isArray(body.ids)) {
      const ids = body.ids.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0);
      await this.activityRepo.markRead(user.id, ids);
    }
    const unreadCount = await this.activityRepo.countUnreadForUser(user.familyId, user.id);
    return { unreadCount };
  }

  private async toPublic(row: FamilyActivityRecord, isRead: boolean): Promise<PublicFamilyActivity> {
    const actor = await this.authRepo.findUserById(row.actorUserId);
    return {
      id: row.id,
      actorUserId: row.actorUserId,
      actorName: actor?.name ?? "?",
      entityType: row.entityType,
      entityId: row.entityId,
      title: row.title,
      path: pathForEntity(row.entityType, row.entityId),
      createdAt: row.createdAt.toISOString(),
      isRead,
    };
  }
}
