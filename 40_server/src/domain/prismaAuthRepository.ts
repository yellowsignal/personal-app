import type { PrismaClient, User as PrismaUser, Family as PrismaFamily } from "@prisma/client";
import type { AuthRepository, CreateUserInput } from "./authRepository.js";
import type { FamilyRecord, UserRecord, UserRole } from "./types.js";

function mapUser(user: PrismaUser): UserRecord {
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    name: user.name,
    familyId: user.familyId,
    role: user.role as UserRole,
    languagePref: user.languagePref,
    countryPref: user.countryPref,
    companyHolidayPref: user.companyHolidayPref,
    currencyPref: user.currencyPref,
    createdAt: user.createdAt,
  };
}

function mapFamily(family: PrismaFamily): FamilyRecord {
  return {
    id: family.id,
    familyName: family.familyName,
    inviteCode: family.inviteCode,
    createdAt: family.createdAt,
  };
}

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly db: PrismaClient) {}

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const user = await this.db.user.findUnique({ where: { email: email.toLowerCase() } });
    return user ? mapUser(user) : null;
  }

  async findUserById(id: number): Promise<UserRecord | null> {
    const user = await this.db.user.findUnique({ where: { id } });
    return user ? mapUser(user) : null;
  }

  async createUser(input: CreateUserInput): Promise<UserRecord> {
    try {
      const user = await this.db.user.create({
        data: {
          email: input.email.toLowerCase(),
          passwordHash: input.passwordHash,
          name: input.name,
          familyId: input.familyId,
          role: input.role,
          languagePref: input.languagePref,
          countryPref: input.countryPref,
          companyHolidayPref: input.companyHolidayPref ?? "NONE",
          currencyPref: input.currencyPref,
        },
      });
      return mapUser(user);
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        throw Object.assign(new Error("email already registered"), { code: "EMAIL_TAKEN" });
      }
      throw err;
    }
  }

  async updateUser(
    id: number,
    patch: Partial<Pick<UserRecord, "familyId" | "role" | "languagePref" | "countryPref" | "companyHolidayPref" | "currencyPref" | "name" | "email">>,
  ): Promise<UserRecord> {
    const user = await this.db.user.update({
      where: { id },
      data: {
        familyId: patch.familyId,
        role: patch.role,
        languagePref: patch.languagePref,
        countryPref: patch.countryPref,
        companyHolidayPref: patch.companyHolidayPref,
        currencyPref: patch.currencyPref,
        name: patch.name,
        email: patch.email?.toLowerCase(),
      },
    });
    return mapUser(user);
  }

  async findFamilyById(id: number): Promise<FamilyRecord | null> {
    const family = await this.db.family.findUnique({ where: { id } });
    return family ? mapFamily(family) : null;
  }

  async findFamilyByInviteCode(inviteCode: string): Promise<FamilyRecord | null> {
    const family = await this.db.family.findUnique({
      where: { inviteCode: inviteCode.trim().toUpperCase() },
    });
    return family ? mapFamily(family) : null;
  }

  async createFamily(familyName: string, inviteCode: string): Promise<FamilyRecord> {
    const family = await this.db.family.create({
      data: { familyName, inviteCode: inviteCode.toUpperCase() },
    });
    return mapFamily(family);
  }

  async updateFamilyInviteCode(id: number, inviteCode: string): Promise<FamilyRecord> {
    const family = await this.db.family.update({
      where: { id },
      data: { inviteCode: inviteCode.toUpperCase() },
    });
    return mapFamily(family);
  }

  async listFamilyMembers(familyId: number): Promise<UserRecord[]> {
    const users = await this.db.user.findMany({
      where: { familyId },
      orderBy: { id: "asc" },
    });
    return users.map(mapUser);
  }

  async countUsers(): Promise<number> {
    return this.db.user.count();
  }

  async createOwnerWithFamily(input: {
    email: string;
    passwordHash: string;
    name: string;
    familyName: string;
    inviteCode: string;
    languagePref: string;
    countryPref: string;
    currencyPref: string;
  }): Promise<{ user: UserRecord; family: FamilyRecord }> {
    try {
      return await this.db.$transaction(async (tx) => {
        const family = await tx.family.create({
          data: {
            familyName: input.familyName,
            inviteCode: input.inviteCode.toUpperCase(),
          },
        });
        const user = await tx.user.create({
          data: {
            email: input.email.toLowerCase(),
            passwordHash: input.passwordHash,
            name: input.name,
            familyId: family.id,
            role: "OWNER",
            languagePref: input.languagePref,
            countryPref: input.countryPref,
            currencyPref: input.currencyPref,
          },
        });
        return { user: mapUser(user), family: mapFamily(family) };
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        throw Object.assign(new Error("email already registered"), { code: "EMAIL_TAKEN" });
      }
      throw err;
    }
  }
}
