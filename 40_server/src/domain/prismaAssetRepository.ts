import type { PrismaClient, Asset as PrismaAsset } from "@prisma/client";
import type {
  CreateAssetInput,
  AssetRepository,
  UpdateAssetInput,
} from "./assetRepository.js";
import type { AssetRecord, StockMarket } from "./assetTypes.js";

function map(row: PrismaAsset): AssetRecord {
  return {
    id: row.id,
    userId: row.userId,
    familyId: row.familyId,
    type: row.type,
    label: row.label,
    currency: row.currency,
    amount: Number(row.amount),
    stockMarket: (row.stockMarket as StockMarket | null) ?? null,
    stockCode: row.stockCode,
    quantity: row.quantity === null ? null : Number(row.quantity),
    buyPrice: row.buyPrice === null ? null : Number(row.buyPrice),
    currentPrice: row.currentPrice === null ? null : Number(row.currentPrice),
    isShared: row.isShared,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
  };
}

export class PrismaAssetRepository implements AssetRepository {
  constructor(private readonly db: PrismaClient) {}

  async findById(id: number): Promise<AssetRecord | null> {
    const row = await this.db.asset.findUnique({ where: { id } });
    return row ? map(row) : null;
  }

  async listForUser(userId: number, familyId: number | null): Promise<AssetRecord[]> {
    const rows = await this.db.asset.findMany({
      where: familyId
        ? {
            OR: [{ userId }, { familyId, isShared: true }],
          }
        : { userId },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(map);
  }

  async create(input: CreateAssetInput): Promise<AssetRecord> {
    const row = await this.db.asset.create({
      data: {
        userId: input.userId,
        familyId: input.familyId,
        type: input.type,
        label: input.label,
        currency: input.currency,
        amount: input.amount,
        stockMarket: input.stockMarket,
        stockCode: input.stockCode,
        quantity: input.quantity,
        buyPrice: input.buyPrice,
        currentPrice: input.currentPrice,
        isShared: input.isShared,
      },
    });
    return map(row);
  }

  async update(id: number, input: UpdateAssetInput): Promise<AssetRecord> {
    const row = await this.db.asset.update({
      where: { id },
      data: {
        type: input.type,
        label: input.label,
        currency: input.currency,
        amount: input.amount,
        stockMarket: input.stockMarket,
        stockCode: input.stockCode,
        quantity: input.quantity,
        buyPrice: input.buyPrice,
        currentPrice: input.currentPrice,
        isShared: input.isShared,
      },
    });
    return map(row);
  }

  async remove(id: number): Promise<boolean> {
    try {
      await this.db.asset.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }
}
