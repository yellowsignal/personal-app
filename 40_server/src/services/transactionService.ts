import type { AuthRepository } from "../domain/authRepository.js";
import type { AssetRepository } from "../domain/assetRepository.js";
import { DEPOSIT_BANKS, toPublicAsset, type DepositBank, type PublicAsset } from "../domain/assetTypes.js";
import type { TransactionRepository } from "../domain/transactionRepository.js";
import { toPublicTransaction, type PublicTransaction } from "../domain/transactionTypes.js";
import { HttpError } from "./authService.js";
import { parseBankStatementCsv } from "./bankCsvParser.js";

export interface ImportStatementResult {
  imported: number;
  skipped: number;
  transactions: PublicTransaction[];
  asset: PublicAsset;
}

export class TransactionService {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly assetRepo: AssetRepository,
    private readonly transactionRepo: TransactionRepository,
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

  private canModify(record: { userId: number }, userId: number): boolean {
    return record.userId === userId;
  }

  private async ownerName(userId: number): Promise<string> {
    const owner = await this.authRepo.findUserById(userId);
    return owner?.name ?? "Unknown";
  }

  async listForAsset(userId: number, assetId: number): Promise<PublicTransaction[]> {
    const user = await this.requireUser(userId);
    const asset = await this.assetRepo.findById(assetId);
    if (!asset) throw new HttpError(404, "asset not found", "NOT_FOUND");
    if (!this.canView(asset, userId, user.familyId)) {
      throw new HttpError(403, "forbidden", "FORBIDDEN");
    }

    const records = await this.transactionRepo.listForAsset(assetId);
    const name = await this.ownerName(asset.userId);
    return records.map((r) => toPublicTransaction(r, name));
  }

  async importStatement(userId: number, assetId: number, csvText: string): Promise<ImportStatementResult> {
    const user = await this.requireUser(userId);
    const asset = await this.assetRepo.findById(assetId);
    if (!asset) throw new HttpError(404, "asset not found", "NOT_FOUND");
    if (!this.canModify(asset, userId)) {
      throw new HttpError(403, "only the owner can import a statement", "FORBIDDEN");
    }
    if (asset.type !== "deposit") {
      throw new HttpError(400, "only deposit assets support statement import");
    }
    if (!asset.bankCode) {
      throw new HttpError(400, "deposit asset must have a bank code");
    }

    const parsed = parseBankStatementCsv(asset.bankCode as DepositBank, csvText);
    if (parsed.length === 0) {
      throw new HttpError(400, "no transactions found in CSV — check bank format and columns");
    }

    let skipped = 0;
    const toCreate = [];
    for (const row of parsed) {
      const date = new Date(`${row.date}T00:00:00.000Z`);
      const dup = await this.transactionRepo.existsDuplicate(
        assetId,
        date,
        row.amount,
        row.category,
        row.description || null,
      );
      if (dup) {
        skipped++;
        continue;
      }
      toCreate.push({
        userId: user.id,
        familyId: user.familyId,
        assetId,
        category: row.category,
        amount: row.amount,
        currency: DEPOSIT_BANKS[asset.bankCode as DepositBank].currency,
        date,
        description: row.description || null,
        balanceAfter: row.balanceAfter,
        isShared: asset.isShared,
      });
    }

    const created = await this.transactionRepo.createMany(toCreate);
    const name = await this.ownerName(user.id);
    const transactions = created.map((r) => toPublicTransaction(r, name));

    let updatedAsset = asset;
    const latestBalance = [...parsed]
      .reverse()
      .map((r) => r.balanceAfter)
      .find((b) => b != null);
    if (latestBalance != null) {
      updatedAsset = await this.assetRepo.update(assetId, { amount: latestBalance });
    }

    return {
      imported: created.length,
      skipped,
      transactions,
      asset: toPublicAsset(updatedAsset, user.name),
    };
  }
}
