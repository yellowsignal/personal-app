import type { AssetRecord } from "./assetTypes.js";

export interface CreateAssetInput {
  userId: number;
  familyId: number | null;
  type: string;
  label: string;
  currency: string;
  amount: number;
  stockCode: string | null;
  buyPrice: number | null;
  isShared: boolean;
}

export interface UpdateAssetInput {
  type?: string;
  label?: string;
  currency?: string;
  amount?: number;
  stockCode?: string | null;
  buyPrice?: number | null;
  isShared?: boolean;
}

export interface AssetRepository {
  findById(id: number): Promise<AssetRecord | null>;
  listForUser(userId: number, familyId: number | null): Promise<AssetRecord[]>;
  create(input: CreateAssetInput): Promise<AssetRecord>;
  update(id: number, input: UpdateAssetInput): Promise<AssetRecord>;
  remove(id: number): Promise<boolean>;
}
