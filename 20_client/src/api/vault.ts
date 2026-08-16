import { startAuthentication } from "@simplewebauthn/browser";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { apiFetch } from "./http";

export type VaultCategory = "LOGIN" | "PRODUCT_KEY" | "OTHER";

export interface PublicVaultItem {
  id: number;
  title: string;
  category: VaultCategory;
  url: string | null;
  memo: string | null;
  hasLoginId: boolean;
  hasSecret: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VaultItemInput {
  title: string;
  category: VaultCategory;
  url?: string;
  loginId?: string;
  /** Omit on edit to keep; empty string clears */
  secret?: string;
  memo?: string;
}

export const vaultApi = {
  list(token: string) {
    return apiFetch<PublicVaultItem[]>("/api/vault", { token });
  },

  create(token: string, body: VaultItemInput) {
    return apiFetch<PublicVaultItem>("/api/vault", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    });
  },

  update(token: string, id: number, body: Partial<VaultItemInput>) {
    return apiFetch<PublicVaultItem>(`/api/vault/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    });
  },

  remove(token: string, id: number) {
    return apiFetch<void>(`/api/vault/${id}`, {
      method: "DELETE",
      token,
    });
  },

  async revealCredentials(token: string, id: number) {
    const options = await apiFetch<PublicKeyCredentialRequestOptionsJSON>(
      `/api/vault/${id}/credentials/reveal/options`,
      { method: "POST", token, body: "{}" },
    );
    const response: AuthenticationResponseJSON = await startAuthentication({ optionsJSON: options });
    return apiFetch<{ loginId: string | null; secret: string | null }>(
      `/api/vault/${id}/credentials/reveal/verify`,
      {
        method: "POST",
        token,
        body: JSON.stringify({ challenge: options.challenge, response }),
      },
    );
  },
};
