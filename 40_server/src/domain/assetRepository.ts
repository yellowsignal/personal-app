import type { AssetRecord, DepositBank, StockMarket } from "./assetTypes.js";

export interface CreateAssetInput {
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
}

export interface UpdateAssetInput {
  type?: string;
  label?: string;
  currency?: string;
  amount?: number;
  bankCode?: DepositBank | null;
  accountNumber?: string | null;
  loginPasswordCipher?: string | null;
  institutionCode?: string | null;
  institutionName?: string | null;
  branchCode?: string | null;
  branchName?: string | null;
  stockMarket?: StockMarket | null;
  stockCode?: string | null;
  quantity?: number | null;
  buyPrice?: number | null;
  currentPrice?: number | null;
  isShared?: boolean;
}

export interface AssetRepository {
  findById(id: number): Promise<AssetRecord | null>;
  listForUser(userId: number, familyId: number | null): Promise<AssetRecord[]>;
  create(input: CreateAssetInput): Promise<AssetRecord>;
  update(id: number, input: UpdateAssetInput): Promise<AssetRecord>;
  remove(id: number): Promise<boolean>;
}
