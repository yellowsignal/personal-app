import { decryptSecret, encryptSecret } from "../auth/secretCrypto.js";
import type { AuthRepository } from "../domain/authRepository.js";
import type { AssetRepository } from "../domain/assetRepository.js";
import {
  DEPOSIT_BANKS,
  toPublicAsset,
  type AssetType,
  type DepositBank,
  type PublicAsset,
  type StockMarket,
  type ViewScope,
} from "../domain/assetTypes.js";
import { HttpError } from "./authService.js";
import type { FamilyActivityService } from "./familyActivityService.js";
import type { PasskeyService } from "./passkeyService.js";
import { currencyForMarket, fetchYahooPrice, toYahooSymbol } from "./stockQuote.js";

const CURRENCIES = new Set(["KRW", "JPY", "USD"]);
const ASSET_TYPES = new Set(["deposit", "stock", "cash", "realestate"]);
const MARKETS = new Set(["KR", "JP", "US"]);
const BANKS = new Set(Object.keys(DEPOSIT_BANKS));

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

function parseMarket(value: unknown): StockMarket {
  if (typeof value !== "string" || !MARKETS.has(value)) {
    throw new HttpError(400, "stockMarket must be KR, JP, or US");
  }
  return value as StockMarket;
}

function parseBank(value: unknown): DepositBank {
  if (typeof value !== "string" || !BANKS.has(value)) {
    throw new HttpError(400, "bankCode must be SHINHAN, MUFG, or YUCHO");
  }
  return value as DepositBank;
}

function parsePositive(value: unknown, field: string): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new HttpError(400, `${field} must be a positive number`);
  return n;
}

function parseOptionalPositive(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  return parsePositive(value, field);
}

function parseAccountNumber(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new HttpError(400, "accountNumber must be a string");
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 64) : null;
}

/** Create: omit/null → no password. Update: omit → keep; ""/null → clear; string → set. */
function parseLoginPasswordCipher(
  body: Record<string, unknown>,
  mode: "create" | "update",
): string | null | undefined {
  if (!("loginPassword" in body)) {
    return mode === "create" ? null : undefined;
  }
  const value = body.loginPassword;
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new HttpError(400, "loginPassword must be a string");
  if (value.length > 512) throw new HttpError(400, "loginPassword is too long");
  return encryptSecret(value);
}

function marketValue(quantity: number, price: number | null | undefined, buyPrice: number | null): number {
  const unit = price != null && price > 0 ? price : buyPrice;
  if (unit == null) return 0;
  return Math.round(quantity * unit * 100) / 100;
}

export class AssetService {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly assetRepo: AssetRepository,
    private readonly activityService: FamilyActivityService | null = null,
    private readonly passkeyService: PasskeyService | null = null,
  ) {}

  private async requireUser(userId: number) {
    const user = await this.authRepo.findUserById(userId);
    if (!user) throw new HttpError(401, "unauthorized", "UNAUTHORIZED");
    return user;
  }

  private canView(
    record: { userId: number; familyId: number | null; isShared: boolean },
    userId: number,
    familyId: number | null,
  ): boolean {
    if (record.userId === userId) return true;
    return Boolean(
      record.isShared && familyId !== null && record.familyId !== null && record.familyId === familyId,
    );
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

  private async notifySharedAsset(
    user: { id: number; name: string; familyId: number | null },
    record: { id: number; familyId: number | null; label: string; isShared: boolean },
  ) {
    if (!record.isShared) return;
    await this.activityService?.recordSharedCreate({
      familyId: record.familyId ?? user.familyId,
      actorUserId: user.id,
      actorName: user.name,
      entityType: "ASSET",
      entityId: record.id,
      title: record.label,
    });
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

    if (type === "stock") {
      const stockMarket = parseMarket(body.stockMarket);
      const stockCode =
        typeof body.stockCode === "string" && body.stockCode.trim()
          ? body.stockCode.trim().slice(0, 32)
          : null;
      if (!stockCode) throw new HttpError(400, "stockCode is required for stocks");
      const quantity = parsePositive(body.quantity, "quantity");
      const buyPrice = parsePositive(body.buyPrice, "buyPrice");
      const currency = currencyForMarket(stockMarket);

      let currentPrice: number | null = null;
      try {
        const quote = await fetchYahooPrice(toYahooSymbol(stockMarket, stockCode));
        currentPrice = quote.price;
      } catch {
        // Allow create without live quote; user can refresh later
        currentPrice = null;
      }

      const amount = marketValue(quantity, currentPrice, buyPrice);
      const record = await this.assetRepo.create({
        userId: user.id,
        familyId: user.familyId,
        type,
        label: body.label.trim().slice(0, 200),
        currency,
        amount,
        bankCode: null,
        accountNumber: null,
        loginPasswordCipher: null,
        stockMarket,
        stockCode,
        quantity,
        buyPrice,
        currentPrice,
        isShared,
      });
      await this.notifySharedAsset(user, record);
      return toPublicAsset(record, user.name);
    }

    if (type === "deposit") {
      const bankCode = parseBank(body.bankCode);
      const currency = DEPOSIT_BANKS[bankCode].currency;
      const accountNumber = "accountNumber" in body ? parseAccountNumber(body.accountNumber) : null;
      const loginPasswordCipher = parseLoginPasswordCipher(body, "create") ?? null;
      const record = await this.assetRepo.create({
        userId: user.id,
        familyId: user.familyId,
        type,
        label: body.label.trim().slice(0, 200),
        currency,
        amount: parseAmount(body.amount),
        bankCode,
        accountNumber,
        loginPasswordCipher,
        stockMarket: null,
        stockCode: null,
        quantity: null,
        buyPrice: null,
        currentPrice: null,
        isShared,
      });
      await this.notifySharedAsset(user, record);
      return toPublicAsset(record, user.name);
    }

    const record = await this.assetRepo.create({
      userId: user.id,
      familyId: user.familyId,
      type,
      label: body.label.trim().slice(0, 200),
      currency: parseCurrency(body.currency),
      amount: parseAmount(body.amount),
      bankCode: null,
      accountNumber: null,
      loginPasswordCipher: null,
      stockMarket: null,
      stockCode: null,
      quantity: null,
      buyPrice: null,
      currentPrice: null,
      isShared,
    });
    await this.notifySharedAsset(user, record);
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

    if (nextType === "deposit") {
      const bankCode =
        body.bankCode !== undefined
          ? parseBank(body.bankCode)
          : existing.bankCode ??
            (() => {
              throw new HttpError(400, "bankCode must be SHINHAN, MUFG, or YUCHO");
            })();
      const loginPasswordCipher = parseLoginPasswordCipher(body, "update");
      const updated = await this.assetRepo.update(id, {
        type: body.type === undefined ? undefined : nextType,
        label:
          typeof body.label === "string" && body.label.trim()
            ? body.label.trim().slice(0, 200)
            : undefined,
        currency: DEPOSIT_BANKS[bankCode].currency,
        amount: body.amount === undefined ? undefined : parseAmount(body.amount),
        bankCode,
        accountNumber: "accountNumber" in body ? parseAccountNumber(body.accountNumber) : undefined,
        loginPasswordCipher,
        stockMarket: null,
        stockCode: null,
        quantity: null,
        buyPrice: null,
        currentPrice: null,
        isShared: body.isShared === undefined ? undefined : isShared,
      });
      return toPublicAsset(updated, user.name);
    }

    if (nextType !== "stock") {
      const updated = await this.assetRepo.update(id, {
        type: body.type === undefined ? undefined : nextType,
        label:
          typeof body.label === "string" && body.label.trim()
            ? body.label.trim().slice(0, 200)
            : undefined,
        currency: body.currency === undefined ? undefined : parseCurrency(body.currency),
        amount: body.amount === undefined ? undefined : parseAmount(body.amount),
        bankCode: null,
        accountNumber: null,
        loginPasswordCipher: null,
        stockMarket: null,
        stockCode: null,
        quantity: null,
        buyPrice: null,
        currentPrice: null,
        isShared: body.isShared === undefined ? undefined : isShared,
      });
      return toPublicAsset(updated, user.name);
    }

    const market: StockMarket =
      body.stockMarket !== undefined
        ? parseMarket(body.stockMarket)
        : existing.stockMarket ??
          (() => {
            throw new HttpError(400, "stockMarket must be KR, JP, or US");
          })();

    const stockCode =
      body.stockCode === undefined
        ? existing.stockCode
        : typeof body.stockCode === "string" && body.stockCode.trim()
          ? body.stockCode.trim().slice(0, 32)
          : null;
    if (!stockCode) throw new HttpError(400, "stockCode is required for stocks");

    const quantity =
      body.quantity === undefined
        ? existing.quantity
        : parsePositive(body.quantity, "quantity");
    if (quantity == null) throw new HttpError(400, "quantity is required for stocks");

    const buyPrice =
      body.buyPrice === undefined
        ? existing.buyPrice
        : parsePositive(body.buyPrice, "buyPrice");
    if (buyPrice == null) throw new HttpError(400, "buyPrice is required for stocks");

    let currentPrice = existing.currentPrice;
    const shouldRefetch =
      body.stockCode !== undefined ||
      body.stockMarket !== undefined ||
      body.refreshQuote === true;
    if (shouldRefetch) {
      try {
        const quote = await fetchYahooPrice(toYahooSymbol(market, stockCode));
        currentPrice = quote.price;
      } catch {
        /* keep previous */
      }
    }
    if (body.currentPrice !== undefined) {
      currentPrice = parseOptionalPositive(body.currentPrice, "currentPrice");
    }

    const amount = marketValue(quantity, currentPrice, buyPrice);
    const updated = await this.assetRepo.update(id, {
      type: body.type === undefined ? undefined : nextType,
      label:
        typeof body.label === "string" && body.label.trim()
          ? body.label.trim().slice(0, 200)
          : undefined,
      currency: currencyForMarket(market),
      amount,
      bankCode: null,
      accountNumber: null,
      loginPasswordCipher: null,
      stockMarket: market,
      stockCode,
      quantity,
      buyPrice,
      currentPrice,
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

  async refreshPrice(userId: number, id: number): Promise<PublicAsset> {
    const user = await this.requireUser(userId);
    const existing = await this.assetRepo.findById(id);
    if (!existing) throw new HttpError(404, "asset not found", "NOT_FOUND");
    if (!this.canView(existing, user.id, user.familyId)) {
      throw new HttpError(403, "forbidden", "FORBIDDEN");
    }
    if (existing.type !== "stock" || !existing.stockCode || !existing.stockMarket) {
      throw new HttpError(400, "not a stock asset with a ticker", "NOT_STOCK");
    }
    if (existing.quantity == null || existing.buyPrice == null) {
      throw new HttpError(400, "stock quantity and buyPrice are required", "STOCK_INCOMPLETE");
    }

    const quote = await fetchYahooPrice(toYahooSymbol(existing.stockMarket, existing.stockCode));
    const amount = marketValue(existing.quantity, quote.price, existing.buyPrice);
    // Only owner can persist; viewers get ephemeral public view with updated numbers
    if (existing.userId === user.id) {
      const updated = await this.assetRepo.update(id, {
        currentPrice: quote.price,
        amount,
        currency: currencyForMarket(existing.stockMarket),
      });
      return toPublicAsset(updated, user.name);
    }

    const owner = await this.authRepo.findUserById(existing.userId);
    return toPublicAsset(
      {
        ...existing,
        currentPrice: quote.price,
        amount,
      },
      owner?.name ?? "Unknown",
    );
  }

  async refreshAllPrices(userId: number): Promise<PublicAsset[]> {
    const user = await this.requireUser(userId);
    const records = await this.assetRepo.listForUser(userId, user.familyId);
    const stocks = records.filter(
      (r) =>
        r.type === "stock" &&
        r.stockCode &&
        r.stockMarket &&
        r.quantity != null &&
        r.userId === user.id,
    );

    for (const stock of stocks) {
      try {
        const quote = await fetchYahooPrice(toYahooSymbol(stock.stockMarket!, stock.stockCode!));
        const amount = marketValue(stock.quantity!, quote.price, stock.buyPrice);
        await this.assetRepo.update(stock.id, {
          currentPrice: quote.price,
          amount,
          currency: currencyForMarket(stock.stockMarket!),
        });
      } catch {
        /* skip failures */
      }
    }

    return this.list(userId, "all");
  }

  async revealCredentialOptions(userId: number, id: number) {
    if (!this.passkeyService) {
      throw new HttpError(503, "passkey not configured", "PASSKEY_UNAVAILABLE");
    }
    const user = await this.requireUser(userId);
    const existing = await this.assetRepo.findById(id);
    if (!existing) throw new HttpError(404, "asset not found", "NOT_FOUND");
    if (!this.canView(existing, user.id, user.familyId)) {
      throw new HttpError(403, "forbidden", "FORBIDDEN");
    }
    if (!existing.loginPasswordCipher && !existing.accountNumber) {
      throw new HttpError(404, "no credentials stored", "NO_CREDENTIALS");
    }
    return this.passkeyService.credentialRevealOptions(user.id, "asset", id);
  }

  async revealCredentials(
    userId: number,
    id: number,
    body: Record<string, unknown>,
  ): Promise<{ accountNumber: string | null; password: string | null }> {
    if (!this.passkeyService) {
      throw new HttpError(503, "passkey not configured", "PASSKEY_UNAVAILABLE");
    }
    const user = await this.requireUser(userId);
    const existing = await this.assetRepo.findById(id);
    if (!existing) throw new HttpError(404, "asset not found", "NOT_FOUND");
    if (!this.canView(existing, user.id, user.familyId)) {
      throw new HttpError(403, "forbidden", "FORBIDDEN");
    }
    if (!existing.loginPasswordCipher && !existing.accountNumber) {
      throw new HttpError(404, "no credentials stored", "NO_CREDENTIALS");
    }

    await this.passkeyService.credentialRevealVerify(user.id, "asset", id, body);

    let password: string | null = null;
    if (existing.loginPasswordCipher) {
      try {
        password = decryptSecret(existing.loginPasswordCipher);
      } catch {
        throw new HttpError(500, "failed to decrypt password", "DECRYPT_FAILED");
      }
    }
    return { accountNumber: existing.accountNumber, password };
  }
}
