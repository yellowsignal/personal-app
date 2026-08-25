import { apiFetch } from "./http";

export interface VaultKeyMeResponse {
  configured: boolean;
  familyId: number | null;
  package: null | {
    kdfSalt: string;
    kdfIterations: number;
    personalDekWrapped: string;
    privateKeyWrapped: string;
    publicKeyJwk: string;
    hasFamilyDek: boolean;
    familyDekWrapped: string | null;
  };
  pendingFamilyDek: null | { fromUserId: number; ciphertext: string };
}

export interface VaultKeyFamilyMember {
  userId: number;
  name: string;
  configured: boolean;
  hasFamilyDek: boolean;
  publicKeyJwk: string | null;
}

export const vaultKeysApi = {
  me(token: string | null) {
    return apiFetch<VaultKeyMeResponse>("/api/vault-keys/me", { token });
  },
  setup(
    token: string | null,
    body: {
      kdfSalt: string;
      kdfIterations: number;
      personalDekWrapped: string;
      privateKeyWrapped: string;
      publicKeyJwk: string;
      familyDekWrapped?: string | null;
    },
  ) {
    return apiFetch<{ configured: boolean; hasFamilyDek: boolean }>("/api/vault-keys/setup", {
      method: "PUT",
      token,
      body: JSON.stringify(body),
    });
  },
  family(token: string | null) {
    return apiFetch<{ members: VaultKeyFamilyMember[] }>("/api/vault-keys/family", { token });
  },
  deliverFamily(token: string | null, body: { toUserId: number; ciphertext: string }) {
    return apiFetch<{ ok: boolean }>("/api/vault-keys/deliver-family", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    });
  },
  acceptFamily(token: string | null, body: { familyDekWrapped: string }) {
    return apiFetch<{ ok: boolean; hasFamilyDek: boolean }>("/api/vault-keys/accept-family", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    });
  },
};
