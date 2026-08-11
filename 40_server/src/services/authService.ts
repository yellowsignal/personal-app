import { generateInviteCode } from "../auth/invite.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { signAuthToken } from "../auth/token.js";
import type { AuthRepository } from "../domain/authRepository.js";
import type { FamilySummary, PublicUser } from "../domain/types.js";
import { toPublicUser } from "../domain/types.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CURRENCIES = new Set(["KRW", "JPY", "USD"]);
const LANGS = new Set(["ko", "ja"]);

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

function normalizeEmail(email: unknown): string {
  if (typeof email !== "string") throw new HttpError(400, "email is required");
  const value = email.trim().toLowerCase();
  if (!EMAIL_RE.test(value)) throw new HttpError(400, "email is invalid");
  return value;
}

function normalizePassword(password: unknown): string {
  if (typeof password !== "string" || password.length < 8) {
    throw new HttpError(400, "password must be at least 8 characters");
  }
  return password;
}

function normalizeName(name: unknown): string {
  if (typeof name !== "string" || !name.trim()) throw new HttpError(400, "name is required");
  return name.trim();
}

function pickPref(value: unknown, allowed: Set<string>, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const v = value.trim();
  return allowed.has(v) ? v : fallback;
}

export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly jwtSecret: string,
  ) {}

  private async uniqueInviteCode(): Promise<string> {
    for (let i = 0; i < 8; i++) {
      const code = generateInviteCode();
      const existing = await this.repo.findFamilyByInviteCode(code);
      if (!existing) return code;
    }
    throw new HttpError(500, "failed to generate invite code");
  }

  private async familySummary(familyId: number): Promise<FamilySummary> {
    const family = await this.repo.findFamilyById(familyId);
    if (!family) throw new HttpError(404, "family not found", "FAMILY_NOT_FOUND");
    const members = await this.repo.listFamilyMembers(familyId);
    return {
      id: family.id,
      familyName: family.familyName,
      inviteCode: family.inviteCode,
      createdAt: family.createdAt.toISOString(),
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
      })),
    };
  }

  async register(body: Record<string, unknown>): Promise<{ token: string; user: PublicUser; family: FamilySummary | null }> {
    const email = normalizeEmail(body.email);
    const password = normalizePassword(body.password);
    const name = normalizeName(body.name);
    const languagePref = pickPref(body.languagePref, LANGS, "ko");
    const countryPref = typeof body.countryPref === "string" && body.countryPref.trim()
      ? body.countryPref.trim().toUpperCase()
      : "JP";
    const currencyPref = pickPref(body.currencyPref, CURRENCIES, "JPY");
    const inviteCode =
      typeof body.inviteCode === "string" && body.inviteCode.trim()
        ? body.inviteCode.trim().toUpperCase()
        : null;
    const familyName =
      typeof body.familyName === "string" && body.familyName.trim()
        ? body.familyName.trim()
        : `${name} Family`;

    const existing = await this.repo.findUserByEmail(email);
    if (existing) throw new HttpError(409, "email already registered", "EMAIL_TAKEN");

    const passwordHash = await hashPassword(password);

    if (inviteCode) {
      const family = await this.repo.findFamilyByInviteCode(inviteCode);
      if (!family) throw new HttpError(404, "invite code not found", "INVITE_NOT_FOUND");
      const members = await this.repo.listFamilyMembers(family.id);
      if (members.length >= 5) {
        throw new HttpError(400, "family is full", "FAMILY_FULL");
      }
      const user = await this.repo.createUser({
        email,
        passwordHash,
        name,
        familyId: family.id,
        role: "MEMBER",
        languagePref,
        countryPref,
        currencyPref,
      });
      const token = signAuthToken({ userId: user.id, email: user.email }, this.jwtSecret);
      return {
        token,
        user: toPublicUser(user),
        family: await this.familySummary(family.id),
      };
    }

    const invite = await this.uniqueInviteCode();
    try {
      const { user, family } = await this.repo.createOwnerWithFamily({
        email,
        passwordHash,
        name,
        familyName,
        inviteCode: invite,
        languagePref,
        countryPref,
        currencyPref,
      });
      const token = signAuthToken({ userId: user.id, email: user.email }, this.jwtSecret);
      return {
        token,
        user: toPublicUser(user),
        family: {
          id: family.id,
          familyName: family.familyName,
          inviteCode: family.inviteCode,
          createdAt: family.createdAt.toISOString(),
          members: [
            {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
            },
          ],
        },
      };
    } catch (err) {
      if ((err as { code?: string }).code === "EMAIL_TAKEN") {
        throw new HttpError(409, "email already registered", "EMAIL_TAKEN");
      }
      throw err;
    }
  }

  async login(body: Record<string, unknown>): Promise<{ token: string; user: PublicUser; family: FamilySummary | null }> {
    const email = normalizeEmail(body.email);
    if (typeof body.password !== "string" || !body.password) {
      throw new HttpError(400, "password is required");
    }
    const password = body.password;
    const user = await this.repo.findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new HttpError(401, "invalid email or password", "INVALID_CREDENTIALS");
    }
    const token = signAuthToken({ userId: user.id, email: user.email }, this.jwtSecret);
    const family = user.familyId ? await this.familySummary(user.familyId) : null;
    return { token, user: toPublicUser(user), family };
  }

  async me(userId: number): Promise<{ user: PublicUser; family: FamilySummary | null }> {
    const user = await this.repo.findUserById(userId);
    if (!user) throw new HttpError(401, "unauthorized", "UNAUTHORIZED");
    const family = user.familyId ? await this.familySummary(user.familyId) : null;
    return { user: toPublicUser(user), family };
  }

  async updateMe(
    userId: number,
    body: Record<string, unknown>,
  ): Promise<{ user: PublicUser }> {
    const patch: {
      languagePref?: string;
      countryPref?: string;
      currencyPref?: string;
      name?: string;
    } = {};
    if (body.languagePref !== undefined) patch.languagePref = pickPref(body.languagePref, LANGS, "ko");
    if (body.currencyPref !== undefined) patch.currencyPref = pickPref(body.currencyPref, CURRENCIES, "JPY");
    if (typeof body.countryPref === "string" && body.countryPref.trim()) {
      patch.countryPref = body.countryPref.trim().toUpperCase();
    }
    if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
    const user = await this.repo.updateUser(userId, patch);
    return { user: toPublicUser(user) };
  }

  async getFamily(userId: number): Promise<FamilySummary> {
    const user = await this.repo.findUserById(userId);
    if (!user) throw new HttpError(401, "unauthorized", "UNAUTHORIZED");
    if (!user.familyId) throw new HttpError(404, "user has no family", "NO_FAMILY");
    return this.familySummary(user.familyId);
  }

  async joinFamily(userId: number, body: Record<string, unknown>): Promise<FamilySummary> {
    if (typeof body.inviteCode !== "string" || !body.inviteCode.trim()) {
      throw new HttpError(400, "inviteCode is required");
    }
    const user = await this.repo.findUserById(userId);
    if (!user) throw new HttpError(401, "unauthorized", "UNAUTHORIZED");
    if (user.familyId) throw new HttpError(400, "already in a family", "ALREADY_IN_FAMILY");

    const family = await this.repo.findFamilyByInviteCode(body.inviteCode);
    if (!family) throw new HttpError(404, "invite code not found", "INVITE_NOT_FOUND");
    const members = await this.repo.listFamilyMembers(family.id);
    if (members.length >= 5) throw new HttpError(400, "family is full", "FAMILY_FULL");

    await this.repo.updateUser(user.id, { familyId: family.id, role: "MEMBER" });
    return this.familySummary(family.id);
  }

  async rotateInvite(userId: number): Promise<FamilySummary> {
    const user = await this.repo.findUserById(userId);
    if (!user) throw new HttpError(401, "unauthorized", "UNAUTHORIZED");
    if (!user.familyId) throw new HttpError(404, "user has no family", "NO_FAMILY");
    if (user.role !== "OWNER") throw new HttpError(403, "only owner can rotate invite", "FORBIDDEN");
    const code = await this.uniqueInviteCode();
    await this.repo.updateFamilyInviteCode(user.familyId, code);
    return this.familySummary(user.familyId);
  }
}
