import { apiFetch } from "./http";
import type { ViewScope } from "../components/ScopeToggle";

export type AssetCurrency = "KRW" | "JPY" | "USD";
export type AssetType = "deposit" | "stock" | "cash" | "realestate";
export type StockMarket = "KR" | "JP" | "US";

export interface PublicAsset {
  id: number;
  userId: number;
  familyId: number | null;
  type: AssetType;
  label: string;
  currency: AssetCurrency;
  amount: number;
  stockMarket: StockMarket | null;
  stockCode: string | null;
  quantity: number | null;
  buyPrice: number | null;
  currentPrice: number | null;
  gainPercent: number | null;
  costBasis: number | null;
  isShared: boolean;
  updatedAt: string;
  createdAt: string;
  ownerName: string;
}

export interface CreateAssetInput {
  type: AssetType;
  label: string;
  currency?: AssetCurrency;
  amount?: number;
  stockMarket?: StockMarket;
  stockCode?: string;
  quantity?: number;
  buyPrice?: number | null;
  isShared?: boolean;
}

export const assetsApi = {
  list(token: string, scope: ViewScope = "all") {
    return apiFetch<PublicAsset[]>(`/api/assets?scope=${scope}`, { token });
  },

  create(token: string, body: CreateAssetInput) {
    return apiFetch<PublicAsset>("/api/assets", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    });
  },

  update(token: string, id: number, body: Partial<CreateAssetInput>) {
    return apiFetch<PublicAsset>(`/api/assets/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    });
  },

  remove(token: string, id: number) {
    return apiFetch<void>(`/api/assets/${id}`, {
      method: "DELETE",
      token,
    });
  },

  refreshPrice(token: string, id: number) {
    return apiFetch<PublicAsset>(`/api/assets/${id}/refresh-price`, {
      method: "POST",
      token,
      body: "{}",
    });
  },

  refreshAllPrices(token: string) {
    return apiFetch<PublicAsset[]>("/api/assets/refresh-prices", {
      method: "POST",
      token,
      body: "{}",
    });
  },
};
