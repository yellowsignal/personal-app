import type { AuthRepository } from "../domain/authRepository.js";
import type { AssetRepository } from "../domain/assetRepository.js";
import {
  toPublicAsset,
  type AssetType,
  type PublicAsset,
  type ViewScope,
} from "../domain/assetTypes.js";
import { HttpError } from "./authService.js";

const CURRENCIES = new Set(["KRW", "JPY", "USD"]);
const ASSET_TYPES = new Set(["deposit", "stock", "cash", "realestate"]);

function parseScope(value: unknown): ViewScope {
  if (value === "personal" || value === "family" || value === "all") return value;
  return "all";
}

function parseAmount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, "amount must be a non-negative number");
  return n;
}

function parseCurrency(value: unknown): string {
  if (typeof value !== "string" || !CURRENCIES.has(value)) {
    throw new HttpError(400, "currency must be KRW, JPY, or USD");
  }
  return value;
}

function parseType(value: unknown): AssetType {
  if (typeof value !== "string" || !ASSET_TYPES.has(value)) {
    throw new HttpError(400, "type must be deposit, stock, cash, or realestate");
  }
  return value as AssetType;
}

function parseOptionalMoney(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, "buyPrice must be a non-negative number");
  return n;
}

export class AssetService {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly assetRepo: AssetRepository,
  ) {}

  private async requireUser(userId: number) {
    const user = await this.authRepo.findUserById(userId);
    if (!user) throw new HttpError(401, "unauthorized", "UNAUTHORIZED");
    return user;
  }

  private filterScope(items: PublicAsset[], scope: ViewScope, userId: number): PublicAsset[] {
    if (scope === "personal") return items.filter((a) => Number(a.userId) === Number(userId));
    if (scope === "family") return items.filter((a) => a.isShared);
    return items;
  }

  private async withOwners(records: Awaited<ReturnType<AssetRepository["listForUser"]>>) {
    const nameCache = new Map<number, string>();
    const out: PublicAsset[] = [];
    for (const record of records) {
      let ownerName = nameCache.get(record.userId);
      if (!ownerName) {
        const owner = await this.authRepo.findUserById(record.userId);
        ownerName = owner?.name ?? "Unknown";
        nameCache.set(record.userId, ownerName);
      }
      out.push(toPublicAsset(record, ownerName));
    }
    return out;
  }

  async list(userId: number, scopeRaw: unknown): Promise<PublicAsset[]> {
    const user = await this.requireUser(userId);
    const scope = parseScope(scopeRaw);
    const records = await this.assetRepo.listForUser(userId, user.familyId);
    const withOwners = await this.withOwners(records);
    return this.filterScope(withOwners, scope, userId);
  }

  async create(userId: number, body: Record<string, unknown>): Promise<PublicAsset> {
    const user = await this.requireUser(userId);
    if (typeof body.label !== "string" || !body.label.trim()) {
      throw new HttpError(400, "label is required");
    }
    const isShared = body.isShared === true;
    if (isShared && !user.familyId) {
      throw new HttpError(400, "join a family before sharing assets", "NO_FAMILY");
    }
    const type = parseType(body.type);
    const stockCode =
      typeof body.stockCode === "string" && body.stockCode.trim()
        ? body.stockCode.trim().slice(0, 20)
        : null;
    const buyPrice = "buyPrice" in body ? parseOptionalMoney(body.buyPrice) : null;
    const record = await this.assetRepo.create({
      userId: user.id,
      familyId: user.familyId,
      type,
      label: body.label.trim().slice(0, 200),
      currency: parseCurrency(body.currency),
      amount: parseAmount(body.amount),
      stockCode: type === "stock" ? stockCode : null,
      buyPrice: type === "stock" ? buyPrice : null,
      isShared,
    });
    return toPublicAsset(record, user.name);
  }

  async update(userId: number, id: number, body: Record<string, unknown>): Promise<PublicAsset> {
    const user = await this.requireUser(userId);
    const existing = await this.assetRepo.findById(id);
    if (!existing) throw new HttpError(404, "asset not found", "NOT_FOUND");
    if (existing.userId !== user.id) {
      throw new HttpError(403, "only the owner can edit this asset", "FORBIDDEN");
    }
    const isShared = body.isShared === undefined ? existing.isShared : body.isShared === true;
    if (isShared && !user.familyId) {
      throw new HttpError(400, "join a family before sharing assets", "NO_FAMILY");
    }
    const nextType = body.type === undefined ? (existing.type as AssetType) : parseType(body.type);

    let stockCode: string | null | undefined = undefined;
    let buyPrice: number | null | undefined = undefined;
    if (nextType !== "stock") {
      stockCode = null;
      buyPrice = null;
    } else {
      if (body.stockCode !== undefined) {
        stockCode =
          typeof body.stockCode === "string" && body.stockCode.trim()
            ? body.stockCode.trim().slice(0, 20)
            : null;
      }
      if (body.buyPrice !== undefined) {
        buyPrice = parseOptionalMoney(body.buyPrice);
      }
    }

    const updated = await this.assetRepo.update(id, {
      type: body.type === undefined ? undefined : nextType,
      label:
        typeof body.label === "string" && body.label.trim()
          ? body.label.trim().slice(0, 200)
          : undefined,
      currency: body.currency === undefined ? undefined : parseCurrency(body.currency),
      amount: body.amount === undefined ? undefined : parseAmount(body.amount),
      stockCode,
      buyPrice,
      isShared: body.isShared === undefined ? undefined : isShared,
    });
    return toPublicAsset(updated, user.name);
  }

  async remove(userId: number, id: number): Promise<void> {
    const user = await this.requireUser(userId);
    const existing = await this.assetRepo.findById(id);
    if (!existing) throw new HttpError(404, "asset not found", "NOT_FOUND");
    if (existing.userId !== user.id) {
      throw new HttpError(403, "only the owner can delete this asset", "FORBIDDEN");
    }
    await this.assetRepo.remove(id);
  }
}
