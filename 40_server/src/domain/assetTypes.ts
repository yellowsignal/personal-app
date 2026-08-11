export type ViewScope = "all" | "personal" | "family";
export type AssetType = "deposit" | "stock" | "cash" | "realestate";
export type StockMarket = "KR" | "JP" | "US";

export interface AssetRecord {
  id: number;
  userId: number;
  familyId: number | null;
  type: string;
  label: string;
  currency: string;
  amount: number;
  stockMarket: StockMarket | null;
  stockCode: string | null;
  quantity: number | null;
  buyPrice: number | null;
  currentPrice: number | null;
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
  stockMarket: StockMarket | null;
  stockCode: string | null;
  quantity: number | null;
  buyPrice: number | null;
  currentPrice: number | null;
  /** ((current - buy) / buy) * 100 when both exist */
  gainPercent: number | null;
  costBasis: number | null;
  isShared: boolean;
  updatedAt: string;
  createdAt: string;
  ownerName: string;
}

export function toPublicAsset(record: AssetRecord, ownerName: string): PublicAsset {
  const quantity = record.quantity;
  const buyPrice = record.buyPrice;
  const currentPrice = record.currentPrice;
  const costBasis =
    quantity != null && buyPrice != null ? quantity * buyPrice : null;
  let gainPercent: number | null = null;
  if (buyPrice != null && buyPrice > 0 && currentPrice != null) {
    gainPercent = ((currentPrice - buyPrice) / buyPrice) * 100;
  }
  return {
    id: record.id,
    userId: record.userId,
    familyId: record.familyId,
    type: record.type as AssetType,
    label: record.label,
    currency: record.currency,
    amount: record.amount,
    stockMarket: record.stockMarket,
    stockCode: record.stockCode,
    quantity,
    buyPrice,
    currentPrice,
    gainPercent,
    costBasis,
    isShared: record.isShared,
    updatedAt: record.updatedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    ownerName,
  };
}
