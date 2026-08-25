import type { AuthRepository } from "../domain/authRepository.js";
import type { VaultKeyRepository } from "../domain/vaultKeyRepository.js";
import { HttpError } from "./authService.js";

function requireString(value: unknown, field: string, maxLen: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, `${field} is required`, "VALIDATION");
  }
  return value.trim().slice(0, maxLen);
}

export class VaultKeyService {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly vaultKeyRepo: VaultKeyRepository,
  ) {}

  private async requireUser(userId: number) {
    const user = await this.authRepo.findUserById(userId);
    if (!user) throw new HttpError(401, "unauthorized", "UNAUTHORIZED");
    return user;
  }

  async me(userId: number) {
    const user = await this.requireUser(userId);
    const pkg = await this.vaultKeyRepo.findByUserId(userId);
    const pending = await this.vaultKeyRepo.findDeliveryForUser(userId);
    return {
      configured: Boolean(pkg),
      package: pkg
        ? {
            kdfSalt: pkg.kdfSalt,
            kdfIterations: pkg.kdfIterations,
            personalDekWrapped: pkg.personalDekWrapped,
            privateKeyWrapped: pkg.privateKeyWrapped,
            publicKeyJwk: pkg.publicKeyJwk,
            hasFamilyDek: Boolean(pkg.familyDekWrapped),
            familyDekWrapped: pkg.familyDekWrapped,
          }
        : null,
      pendingFamilyDek: pending
        ? {
            fromUserId: pending.fromUserId,
            ciphertext: pending.ciphertext,
          }
        : null,
      familyId: user.familyId,
    };
  }

  async setup(userId: number, body: Record<string, unknown>) {
    const user = await this.requireUser(userId);
    const kdfSalt = requireString(body.kdfSalt, "kdfSalt", 64);
    const kdfIterations =
      typeof body.kdfIterations === "number" && body.kdfIterations >= 100_000
        ? Math.min(Math.floor(body.kdfIterations), 2_000_000)
        : (() => {
            throw new HttpError(400, "kdfIterations must be >= 100000", "VALIDATION");
          })();
    const personalDekWrapped = requireString(body.personalDekWrapped, "personalDekWrapped", 10_000);
    const privateKeyWrapped = requireString(body.privateKeyWrapped, "privateKeyWrapped", 50_000);
    const publicKeyJwk = requireString(body.publicKeyJwk, "publicKeyJwk", 10_000);
    const familyDekWrapped =
      typeof body.familyDekWrapped === "string" && body.familyDekWrapped.trim()
        ? body.familyDekWrapped.trim().slice(0, 10_000)
        : null;

    const existing = await this.vaultKeyRepo.findByUserId(userId);
    if (existing) {
      throw new HttpError(409, "vault already configured", "VAULT_EXISTS");
    }

    const pkg = await this.vaultKeyRepo.upsert({
      userId,
      familyId: user.familyId,
      kdfSalt,
      kdfIterations,
      personalDekWrapped,
      privateKeyWrapped,
      publicKeyJwk,
      familyDekWrapped,
    });

    return {
      configured: true,
      hasFamilyDek: Boolean(pkg.familyDekWrapped),
    };
  }

  async listFamily(userId: number) {
    const user = await this.requireUser(userId);
    if (!user.familyId) return { members: [] as unknown[] };
    const members = await this.authRepo.listFamilyMembers(user.familyId);
    const packages = await this.vaultKeyRepo.listByFamilyId(user.familyId);
    const byUser = new Map(packages.map((p) => [p.userId, p]));
    return {
      members: members.map((m) => {
        const pkg = byUser.get(m.id);
        return {
          userId: m.id,
          name: m.name,
          configured: Boolean(pkg),
          hasFamilyDek: Boolean(pkg?.familyDekWrapped),
          publicKeyJwk: pkg?.publicKeyJwk ?? null,
        };
      }),
    };
  }

  async deliverFamilyDek(userId: number, body: Record<string, unknown>) {
    const user = await this.requireUser(userId);
    if (!user.familyId) throw new HttpError(400, "join a family first", "NO_FAMILY");
    const sender = await this.vaultKeyRepo.findByUserId(userId);
    if (!sender?.familyDekWrapped) {
      throw new HttpError(400, "unlock and obtain family DEK first", "NO_FAMILY_DEK");
    }
    const toUserId = typeof body.toUserId === "number" ? body.toUserId : Number(body.toUserId);
    if (!Number.isFinite(toUserId)) throw new HttpError(400, "toUserId required", "VALIDATION");
    const ciphertext = requireString(body.ciphertext, "ciphertext", 20_000);

    const target = await this.authRepo.findUserById(toUserId);
    if (!target || target.familyId !== user.familyId) {
      throw new HttpError(404, "family member not found", "NOT_FOUND");
    }
    const targetPkg = await this.vaultKeyRepo.findByUserId(toUserId);
    if (!targetPkg) throw new HttpError(400, "member has not set up vault", "VAULT_NOT_CONFIGURED");
    if (targetPkg.familyDekWrapped) {
      throw new HttpError(409, "member already has family DEK", "ALREADY_HAS_FAMILY_DEK");
    }

    await this.vaultKeyRepo.upsertDelivery({
      familyId: user.familyId,
      toUserId,
      fromUserId: userId,
      ciphertext,
    });
    return { ok: true };
  }

  async acceptFamilyDek(userId: number, body: Record<string, unknown>) {
    await this.requireUser(userId);
    const familyDekWrapped = requireString(body.familyDekWrapped, "familyDekWrapped", 10_000);
    const pkg = await this.vaultKeyRepo.findByUserId(userId);
    if (!pkg) throw new HttpError(400, "vault not configured", "VAULT_NOT_CONFIGURED");
    await this.vaultKeyRepo.setFamilyDekWrapped(userId, familyDekWrapped);
    await this.vaultKeyRepo.deleteDeliveryForUser(userId);
    return { ok: true, hasFamilyDek: true };
  }
}
