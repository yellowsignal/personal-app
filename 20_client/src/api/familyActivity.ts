import { apiFetch } from "./http";

export type FamilyActivityEntityType =
  | "CALENDAR_EVENT"
  | "DOCUMENT"
  | "CHECKLIST"
  | "ASSET"
  | "SUBSCRIPTION"
  | "PHOTO";

export type FamilyActivityAction = "CREATED" | "UPDATED" | "DELETED";

export interface PublicFamilyActivity {
  id: number;
  actorUserId: number;
  actorName: string;
  entityType: FamilyActivityEntityType;
  entityId: number;
  action: FamilyActivityAction;
  title: string;
  summary: string;
  path: string;
  createdAt: string;
  isRead: boolean;
}

export interface FamilyActivitySummary {
  unreadCount: number;
  latest: PublicFamilyActivity | null;
}

export const familyActivityApi = {
  summary(token: string) {
    return apiFetch<FamilyActivitySummary>("/api/family/activity/summary", { token });
  },

  list(token: string, limit = 30) {
    return apiFetch<PublicFamilyActivity[]>(`/api/family/activity?limit=${limit}`, { token });
  },

  markRead(token: string, body: { all?: boolean; ids?: number[] }) {
    return apiFetch<{ unreadCount: number }>("/api/family/activity/read", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    });
  },
};

export async function syncAppBadge(count: number) {
  try {
    if (!("setAppBadge" in navigator)) return;
    if (count > 0) await navigator.setAppBadge(count);
    else await navigator.clearAppBadge();
  } catch {
    /* unsupported */
  }
}
