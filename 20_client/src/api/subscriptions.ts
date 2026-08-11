import { startAuthentication } from "@simplewebauthn/browser";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { apiFetch } from "./http";
import type { ViewScope } from "../components/ScopeToggle";

export type SubscriptionCurrency = "KRW" | "JPY" | "USD";
export type BillingInterval = "MONTHLY" | "YEARLY";

export interface PublicSubscription {
  id: number;
  userId: number;
  familyId: number | null;
  serviceName: string;
  cost: number;
  currency: SubscriptionCurrency;
  billingInterval: BillingInterval;
  billingMonth: number | null;
  billingDate: number;
  loginId: string | null;
  hasPassword: boolean;
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
  billingInterval: BillingInterval;
  /** ISO date yyyy-mm-dd from iOS date picker */
  billingAnchorDate: string;
  loginId?: string;
  /** Omit on edit to keep existing; empty string clears */
  loginPassword?: string;
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

  async revealCredentials(token: string, id: number) {
    const options = await apiFetch<PublicKeyCredentialRequestOptionsJSON>(
      `/api/subscriptions/${id}/credentials/reveal/options`,
      { method: "POST", token, body: "{}" },
    );
    const response: AuthenticationResponseJSON = await startAuthentication({ optionsJSON: options });
    return apiFetch<{ loginId: string | null; password: string | null }>(
      `/api/subscriptions/${id}/credentials/reveal/verify`,
      {
        method: "POST",
        token,
        body: JSON.stringify({ challenge: options.challenge, response }),
      },
    );
  },
};
