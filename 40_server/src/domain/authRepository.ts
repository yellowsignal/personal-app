import type { FamilyRecord, UserRecord, UserRole } from "./types.js";

export interface CreateUserInput {
  email: string;
  passwordHash: string | null;
  name: string;
  familyId: number | null;
  role: UserRole;
  languagePref: string;
  countryPref: string;
  currencyPref: string;
}

export interface AuthRepository {
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: number): Promise<UserRecord | null>;
  createUser(input: CreateUserInput): Promise<UserRecord>;
  updateUser(
    id: number,
    patch: Partial<Pick<UserRecord, "familyId" | "role" | "languagePref" | "countryPref" | "currencyPref" | "name" | "email">>,
  ): Promise<UserRecord>;

  findFamilyById(id: number): Promise<FamilyRecord | null>;
  findFamilyByInviteCode(inviteCode: string): Promise<FamilyRecord | null>;
  createFamily(familyName: string, inviteCode: string): Promise<FamilyRecord>;
  updateFamilyInviteCode(id: number, inviteCode: string): Promise<FamilyRecord>;
  listFamilyMembers(familyId: number): Promise<UserRecord[]>;

  /** Atomic helper used by register flows */
  createOwnerWithFamily(input: {
    email: string;
    passwordHash: string | null;
    name: string;
    familyName: string;
    inviteCode: string;
    languagePref: string;
    countryPref: string;
    currencyPref: string;
  }): Promise<{ user: UserRecord; family: FamilyRecord }>;

  countUsers(): Promise<number>;
}
