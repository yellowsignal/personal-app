import type { AuthRepository, CreateUserInput } from "./authRepository.js";
import type { FamilyRecord, UserRecord } from "./types.js";

export class MemoryAuthRepository implements AuthRepository {
  private users = new Map<number, UserRecord>();
  private families = new Map<number, FamilyRecord>();
  private nextUserId = 1;
  private nextFamilyId = 1;

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const normalized = email.toLowerCase();
    for (const user of this.users.values()) {
      if (user.email === normalized) return { ...user };
    }
    return null;
  }

  async findUserById(id: number): Promise<UserRecord | null> {
    const user = this.users.get(id);
    return user ? { ...user } : null;
  }

  async createUser(input: CreateUserInput): Promise<UserRecord> {
    const existing = await this.findUserByEmail(input.email);
    if (existing) throw Object.assign(new Error("email already registered"), { code: "EMAIL_TAKEN" });
    const user: UserRecord = {
      id: this.nextUserId++,
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      name: input.name,
      familyId: input.familyId,
      role: input.role,
      languagePref: input.languagePref,
      countryPref: input.countryPref,
      companyHolidayPref: input.companyHolidayPref ?? "NONE",
      currencyPref: input.currencyPref,
      createdAt: new Date(),
    };
    this.users.set(user.id, user);
    return { ...user };
  }

  async updateUser(
    id: number,
    patch: Partial<Pick<UserRecord, "familyId" | "role" | "languagePref" | "countryPref" | "companyHolidayPref" | "currencyPref" | "name" | "email">>,
  ): Promise<UserRecord> {
    const user = this.users.get(id);
    if (!user) throw Object.assign(new Error("user not found"), { code: "NOT_FOUND" });
    const updated = { ...user, ...patch };
    this.users.set(id, updated);
    return { ...updated };
  }

  async findFamilyById(id: number): Promise<FamilyRecord | null> {
    const family = this.families.get(id);
    return family ? { ...family } : null;
  }

  async findFamilyByInviteCode(inviteCode: string): Promise<FamilyRecord | null> {
    const normalized = inviteCode.trim().toUpperCase();
    for (const family of this.families.values()) {
      if (family.inviteCode === normalized) return { ...family };
    }
    return null;
  }

  async createFamily(familyName: string, inviteCode: string): Promise<FamilyRecord> {
    const family: FamilyRecord = {
      id: this.nextFamilyId++,
      familyName,
      inviteCode: inviteCode.toUpperCase(),
      createdAt: new Date(),
    };
    this.families.set(family.id, family);
    return { ...family };
  }

  async updateFamilyInviteCode(id: number, inviteCode: string): Promise<FamilyRecord> {
    const family = this.families.get(id);
    if (!family) throw Object.assign(new Error("family not found"), { code: "NOT_FOUND" });
    const updated = { ...family, inviteCode: inviteCode.toUpperCase() };
    this.families.set(id, updated);
    return { ...updated };
  }

  async listFamilyMembers(familyId: number): Promise<UserRecord[]> {
    return [...this.users.values()]
      .filter((u) => u.familyId === familyId)
      .map((u) => ({ ...u }));
  }

  async createOwnerWithFamily(input: {
    email: string;
    passwordHash: string | null;
    name: string;
    familyName: string;
    inviteCode: string;
    languagePref: string;
    countryPref: string;
    currencyPref: string;
  }): Promise<{ user: UserRecord; family: FamilyRecord }> {
    const family = await this.createFamily(input.familyName, input.inviteCode);
    const user = await this.createUser({
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.name,
      familyId: family.id,
      role: "OWNER",
      languagePref: input.languagePref,
      countryPref: input.countryPref,
      currencyPref: input.currencyPref,
    });
    return { user, family };
  }

  async countUsers(): Promise<number> {
    return this.users.size;
  }
}
