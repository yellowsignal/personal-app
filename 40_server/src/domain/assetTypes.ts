export type ViewScope = "all" | "personal" | "family";
export type AssetType = "deposit" | "stock" | "cash" | "realestate";

export interface AssetRecord {
  id: number;
  userId: number;
  familyId: number | null;
  type: string;
  label: string;
  currency: string;
  amount: number;
  stockCode: string | null;
  buyPrice: number | null;
  isShared: boolean;
  updatedAt: Date;
  createdAt: Date;
}

export interface PublicAsset {
  id: number;
  userId: number;
  familyId: number | null;
  type: AssetType;
  label: string;
  currency: string;
  amount: number;
  stockCode: string | null;
  buyPrice: number | null;
  isShared: boolean;
  updatedAt: string;
  createdAt: string;
  ownerName: string;
}

export function toPublicAsset(record: AssetRecord, ownerName: string): PublicAsset {
  return {
    id: record.id,
    userId: record.userId,
    familyId: record.familyId,
    type: record.type as AssetType,
    label: record.label,
    currency: record.currency,
    amount: record.amount,
    stockCode: record.stockCode,
    buyPrice: record.buyPrice,
    isShared: record.isShared,
    updatedAt: record.updatedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    ownerName,
  };
}
