import { apiFetch } from "./http";

export type UserRole = "OWNER" | "MEMBER";

export interface PublicUser {
  id: number;
  email: string;
  name: string;
  familyId: number | null;
  role: UserRole;
  languagePref: string;
  countryPref: string;
  currencyPref: string;
  createdAt: string;
}

export interface FamilySummary {
  id: number;
  familyName: string;
  inviteCode: string;
  icloudSharedAlbumUrl: string | null;
  createdAt: string;
  members: Array<{
    id: number;
    name: string;
    email: string;
    role: UserRole;
  }>;
}

export interface AuthResponse {
  token: string;
  user: PublicUser;
  family: FamilySummary | null;
}

export interface MeResponse {
  user: PublicUser;
  family: FamilySummary | null;
}

export const authApi = {
  register(body: {
    email: string;
    password: string;
    name: string;
    familyName?: string;
    inviteCode?: string;
    languagePref?: string;
    currencyPref?: string;
    countryPref?: string;
  }) {
    return apiFetch<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  login(body: { email: string; password: string }) {
    return apiFetch<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  me(token: string) {
    return apiFetch<MeResponse>("/api/auth/me", { token });
  },

  updateMe(
    token: string,
    body: Partial<{
      languagePref: string;
      currencyPref: string;
      countryPref: string;
      name: string;
    }>,
  ) {
    return apiFetch<{ user: PublicUser }>("/api/auth/me", {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    });
  },
};
