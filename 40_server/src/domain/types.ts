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
  createdAt: string;
  members: Array<{
    id: number;
    name: string;
    email: string;
    role: UserRole;
  }>;
}

export interface UserRecord {
  id: number;
  email: string;
  passwordHash: string;
  name: string;
  familyId: number | null;
  role: UserRole;
  languagePref: string;
  countryPref: string;
  currencyPref: string;
  createdAt: Date;
}

export interface FamilyRecord {
  id: number;
  familyName: string;
  inviteCode: string;
  createdAt: Date;
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    familyId: user.familyId,
    role: user.role,
    languagePref: user.languagePref,
    countryPref: user.countryPref,
    currencyPref: user.currencyPref,
    createdAt: user.createdAt.toISOString(),
  };
}
