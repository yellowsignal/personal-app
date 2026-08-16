export type ViewScope = "all" | "personal" | "family";
export type AssetType = "deposit" | "stock" | "cash" | "realestate";
export type StockMarket = "KR" | "JP" | "US";
/** Supported deposit banks (CSV parsers will follow these codes). */
export type DepositBank = "SHINHAN" | "MUFG" | "YUCHO";

export const DEPOSIT_BANKS: Record<
  DepositBank,
  {
    country: "KR" | "JP";
    currency: "KRW" | "JPY";
    /** Default JP 金融機関コード / 銀行名 when selecting this preset */
    institutionCode?: string;
    institutionName?: string;
  }
> = {
  SHINHAN: { country: "KR", currency: "KRW" },
  MUFG: {
    country: "JP",
    currency: "JPY",
    institutionCode: "0005",
    institutionName: "三菱UFJ銀行",
  },
  YUCHO: {
    country: "JP",
    currency: "JPY",
    institutionCode: "9900",
    institutionName: "ゆうちょ銀行",
  },
};

export interface AssetRecord {
  id: number;
  userId: number;
  familyId: number | null;
  type: string;
  label: string;
  currency: string;
  amount: number;
  bankCode: DepositBank | null;
  accountNumber: string | null;
  loginPasswordCipher: string | null;
  institutionCode: string | null;
  institutionName: string | null;
  branchCode: string | null;
  branchName: string | null;
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
  bankCode: DepositBank | null;
  accountNumber: string | null;
  hasPassword: boolean;
  institutionCode: string | null;
  institutionName: string | null;
  branchCode: string | null;
  branchName: string | null;
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
    bankCode: record.bankCode,
    accountNumber: record.accountNumber,
    hasPassword: Boolean(record.loginPasswordCipher),
    institutionCode: record.institutionCode,
    institutionName: record.institutionName,
    branchCode: record.branchCode,
    branchName: record.branchName,
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
