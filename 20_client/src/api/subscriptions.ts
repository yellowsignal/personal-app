import { apiFetch } from "./http";
import type { ViewScope } from "../components/ScopeToggle";

export type SubscriptionCurrency = "KRW" | "JPY" | "USD";

export interface PublicSubscription {
  id: number;
  userId: number;
  familyId: number | null;
  serviceName: string;
  cost: number;
  currency: SubscriptionCurrency;
  billingDate: number;
  cancelUrl: string | null;
  reason: string | null;
  isShared: boolean;
  createdAt: string;
  ownerName: string;
}

export interface CreateSubscriptionInput {
  serviceName: string;
  cost: number;
  currency: SubscriptionCurrency;
  billingDate: number;
  cancelUrl?: string;
  reason?: string;
  isShared?: boolean;
}

export const subscriptionsApi = {
  list(token: string, scope: ViewScope = "all") {
    return apiFetch<PublicSubscription[]>(`/api/subscriptions?scope=${scope}`, { token });
  },

  create(token: string, body: CreateSubscriptionInput) {
    return apiFetch<PublicSubscription>("/api/subscriptions", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    });
  },

  update(token: string, id: number, body: Partial<CreateSubscriptionInput>) {
    return apiFetch<PublicSubscription>(`/api/subscriptions/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    });
  },

  remove(token: string, id: number) {
    return apiFetch<void>(`/api/subscriptions/${id}`, {
      method: "DELETE",
      token,
    });
  },
};
