import { encryptSecret, decryptSecret } from "../auth/secretCrypto.js";
import type { AuthRepository } from "../domain/authRepository.js";
import type { VaultItemRepository } from "../domain/vaultTypes.js";
import {
  toPublicVaultItem,
  type PublicVaultItem,
  type VaultCategory,
} from "../domain/vaultTypes.js";
import { HttpError } from "./authService.js";
import type { PasskeyService } from "./passkeyService.js";

const CATEGORIES = new Set<VaultCategory>(["LOGIN", "PRODUCT_KEY", "OTHER"]);

function parseCategory(raw: unknown, fallback: VaultCategory = "LOGIN"): VaultCategory {
  if (typeof raw === "string" && CATEGORIES.has(raw as VaultCategory)) {
    return raw as VaultCategory;
  }
  if (raw === undefined) return fallback;
  throw new HttpError(400, "category must be LOGIN, PRODUCT_KEY, or OTHER");
}

function parseOptionalTrimmed(
  raw: unknown,
  field: string,
  max: number,
): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") throw new HttpError(400, `${field} must be a string`);
  const t = raw.trim();
  if (!t) return null;
  return t.slice(0, max);
}

export class VaultService {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly vaultRepo: VaultItemRepository,
    private readonly passkeyService: PasskeyService | null = null,
  ) {}

  private async requireUser(userId: number) {
    const user = await this.authRepo.findUserById(userId);
    if (!user) throw new HttpError(401, "unauthorized", "UNAUTHORIZED");
    return user;
  }

  private async requireOwned(userId: number, id: number) {
    const existing = await this.vaultRepo.findById(id);
    if (!existing) throw new HttpError(404, "vault item not found", "NOT_FOUND");
    if (existing.userId !== userId) throw new HttpError(403, "forbidden", "FORBIDDEN");
    return existing;
  }

  async list(userId: number): Promise<PublicVaultItem[]> {
    await this.requireUser(userId);
    const rows = await this.vaultRepo.listForUser(userId);
    return rows.map(toPublicVaultItem);
  }

  async create(userId: number, body: Record<string, unknown>): Promise<PublicVaultItem> {
    await this.requireUser(userId);
    if (typeof body.title !== "string" || !body.title.trim()) {
      throw new HttpError(400, "title is required");
    }
    const category = parseCategory(body.category);
    const loginId = parseOptionalTrimmed(body.loginId, "loginId", 255) ?? null;
    let secretCipher: string | null = null;
    if (typeof body.secret === "string" && body.secret.length > 0) {
      secretCipher = encryptSecret(body.secret.slice(0, 4000));
    }
    const url = parseOptionalTrimmed(body.url, "url", 500) ?? null;
    const memo = parseOptionalTrimmed(body.memo, "memo", 2000) ?? null;
    if (!loginId && !secretCipher) {
      throw new HttpError(400, "loginId or secret is required", "NO_CREDENTIALS");
    }
    const row = await this.vaultRepo.create({
      userId,
      title: body.title.trim().slice(0, 200),
      category,
      url,
      loginId,
      secretCipher,
      memo,
    });
    return toPublicVaultItem(row);
  }

  async update(userId: number, id: number, body: Record<string, unknown>): Promise<PublicVaultItem> {
    await this.requireUser(userId);
    const existing = await this.requireOwned(userId, id);
    const patch: Parameters<VaultItemRepository["update"]>[1] = {};
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim()) {
        throw new HttpError(400, "title is required");
      }
      patch.title = body.title.trim().slice(0, 200);
    }
    if (body.category !== undefined) patch.category = parseCategory(body.category);
    if ("url" in body) patch.url = parseOptionalTrimmed(body.url, "url", 500) ?? null;
    if ("loginId" in body) patch.loginId = parseOptionalTrimmed(body.loginId, "loginId", 255) ?? null;
    if ("memo" in body) patch.memo = parseOptionalTrimmed(body.memo, "memo", 2000) ?? null;
    if ("secret" in body) {
      if (body.secret === null || body.secret === "") {
        patch.secretCipher = null;
      } else if (typeof body.secret === "string") {
        patch.secretCipher = encryptSecret(body.secret.slice(0, 4000));
      } else {
        throw new HttpError(400, "secret must be a string");
      }
    }
    const nextLoginId = patch.loginId === undefined ? existing.loginId : patch.loginId;
    const nextSecret =
      patch.secretCipher === undefined ? existing.secretCipher : patch.secretCipher;
    if (!nextLoginId && !nextSecret) {
      throw new HttpError(400, "loginId or secret is required", "NO_CREDENTIALS");
    }
    const row = await this.vaultRepo.update(id, patch);
    return toPublicVaultItem(row);
  }

  async remove(userId: number, id: number): Promise<void> {
    await this.requireUser(userId);
    await this.requireOwned(userId, id);
    await this.vaultRepo.remove(id);
  }

  async revealCredentialOptions(userId: number, id: number) {
    if (!this.passkeyService) {
      throw new HttpError(503, "passkey not configured", "PASSKEY_UNAVAILABLE");
    }
    await this.requireUser(userId);
    const existing = await this.requireOwned(userId, id);
    if (!existing.loginId && !existing.secretCipher) {
      throw new HttpError(404, "no credentials stored", "NO_CREDENTIALS");
    }
    return this.passkeyService.credentialRevealOptions(userId, "vault", id);
  }

  async revealCredentials(
    userId: number,
    id: number,
    body: Record<string, unknown>,
  ): Promise<{ loginId: string | null; secret: string | null }> {
    if (!this.passkeyService) {
      throw new HttpError(503, "passkey not configured", "PASSKEY_UNAVAILABLE");
    }
    await this.requireUser(userId);
    const existing = await this.requireOwned(userId, id);
    if (!existing.loginId && !existing.secretCipher) {
      throw new HttpError(404, "no credentials stored", "NO_CREDENTIALS");
    }
    await this.passkeyService.credentialRevealVerify(userId, "vault", id, body);
    let secret: string | null = null;
    if (existing.secretCipher) {
      try {
        secret = decryptSecret(existing.secretCipher);
      } catch {
        throw new HttpError(500, "failed to decrypt secret", "DECRYPT_FAILED");
      }
    }
    return { loginId: existing.loginId, secret };
  }
}
