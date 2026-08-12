import { apiFetch } from "./http";
import type { ViewScope } from "../components/ScopeToggle";

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

export interface PublicChecklistItem {
  id: number;
  checklistId: number;
  parentId: number | null;
  title: string;
  sortOrder: number;
  createdAt: string;
}

export interface PublicChecklistDetail extends PublicChecklist {
  items: PublicChecklistItem[];
}

export interface CreateChecklistInput {
  title: string;
  isShared?: boolean;
}

export const checklistsApi = {
  list(token: string, scope: ViewScope = "all") {
    return apiFetch<PublicChecklist[]>(`/api/checklists?scope=${scope}`, { token });
  },

  get(token: string, id: number) {
    return apiFetch<PublicChecklistDetail>(`/api/checklists/${id}`, { token });
  },

  create(token: string, body: CreateChecklistInput) {
    return apiFetch<PublicChecklist>("/api/checklists", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    });
  },

  update(token: string, id: number, body: Partial<CreateChecklistInput>) {
    return apiFetch<PublicChecklist>(`/api/checklists/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    });
  },

  remove(token: string, id: number) {
    return apiFetch<void>(`/api/checklists/${id}`, { method: "DELETE", token });
  },

  addItem(token: string, checklistId: number, body: { title: string; parentId?: number | null }) {
    return apiFetch<PublicChecklistItem>(`/api/checklists/${checklistId}/items`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
    });
  },

  removeItem(token: string, checklistId: number, itemId: number) {
    return apiFetch<void>(`/api/checklists/${checklistId}/items/${itemId}`, {
      method: "DELETE",
      token,
    });
  },
};
