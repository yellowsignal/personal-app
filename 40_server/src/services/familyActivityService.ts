import type { AuthRepository } from "../domain/authRepository.js";
import type {
  FamilyActivityAction,
  FamilyActivityEntityType,
  FamilyActivityRecord,
  FamilyActivityRepository,
} from "../domain/familyActivityTypes.js";
import { pathForEntity } from "../domain/familyActivityTypes.js";
import {
  formatFamilyActivityPushTitle,
  formatFamilyActivitySummary,
  serializeActivityDetail,
  type ActivityDetail,
} from "../domain/familyActivityFormat.js";
import { HttpError } from "./authService.js";
import type { PushService } from "./pushService.js";

export interface PublicFamilyActivity {
  id: number;
  actorUserId: number;
  actorName: string;
  entityType: FamilyActivityEntityType;
  entityId: number;
  action: FamilyActivityAction;
  title: string;
  /** Localized one-line explanation for the viewer. */
  summary: string;
  path: string;
  createdAt: string;
  isRead: boolean;
}

export interface FamilyActivitySummary {
  unreadCount: number;
  latest: PublicFamilyActivity | null;
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
   * Record a family feed item and notify other members (push + badge count).
   * Best-effort: never throws into the primary create/update/delete path.
   */
  async recordActivity(input: {
    familyId: number | null | undefined;
    actorUserId: number;
    actorName: string;
    entityType: FamilyActivityEntityType;
    entityId: number;
    action: FamilyActivityAction;
    title: string;
    detail?: ActivityDetail | null;
  }): Promise<void> {
    if (input.familyId == null) return;
    const title = input.title.trim().slice(0, 200) || "(untitled)";
    try {
      const activity = await this.activityRepo.create({
        familyId: input.familyId,
        actorUserId: input.actorUserId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        title,
        detailJson: serializeActivityDetail(input.detail),
      });

      if (!this.pushService) return;
      try {
        const members = await this.authRepo.listFamilyMembers(input.familyId);
        const recipients = members.filter((m) => m.id !== input.actorUserId);
        for (const member of recipients) {
          const unreadCount = await this.activityRepo.countUnreadForUser(input.familyId, member.id);
          const summary = formatFamilyActivitySummary({
            languagePref: member.languagePref,
            action: activity.action,
            entityType: activity.entityType,
            title: activity.title,
            detailJson: activity.detailJson,
          });
          await this.pushService.sendToUsers([member.id], {
            title: formatFamilyActivityPushTitle({
              languagePref: member.languagePref,
              actorName: input.actorName,
              entityType: activity.entityType,
            }),
            body: summary,
            url: pathForEntity(activity.entityType, activity.entityId),
            tag: `family-activity-${activity.id}`,
            unreadCount,
          });
        }
      } catch (err) {
        console.error("[family-activity] push failed", err);
      }
    } catch (err) {
      console.error("[family-activity] recordActivity failed", err);
    }
  }

  /** @deprecated Prefer recordActivity({ action: "CREATED" }) */
  async recordSharedCreate(input: {
    familyId: number | null | undefined;
    actorUserId: number;
    actorName: string;
    entityType: FamilyActivityEntityType;
    entityId: number;
    title: string;
  }): Promise<void> {
    await this.recordActivity({ ...input, action: "CREATED" });
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
        out.push(await this.toPublic(row, true, user.languagePref));
        continue;
      }
      out.push(await this.toPublic(row, !unreadIds.has(row.id), user.languagePref));
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

  private async toPublic(
    row: FamilyActivityRecord,
    isRead: boolean,
    languagePref: string | null | undefined,
  ): Promise<PublicFamilyActivity> {
    const actor = await this.authRepo.findUserById(row.actorUserId);
    return {
      id: row.id,
      actorUserId: row.actorUserId,
      actorName: actor?.name ?? "?",
      entityType: row.entityType,
      entityId: row.entityId,
      action: row.action,
      title: row.title,
      summary: formatFamilyActivitySummary({
        languagePref,
        action: row.action,
        entityType: row.entityType,
        title: row.title,
        detailJson: row.detailJson,
      }),
      path: pathForEntity(row.entityType, row.entityId),
      createdAt: row.createdAt.toISOString(),
      isRead,
    };
  }
}
