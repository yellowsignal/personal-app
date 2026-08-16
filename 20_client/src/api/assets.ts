import { startAuthentication } from "@simplewebauthn/browser";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { apiFetch } from "./http";
import type { ViewScope } from "../components/ScopeToggle";

export type AssetCurrency = "KRW" | "JPY" | "USD";
export type AssetType = "deposit" | "stock" | "cash" | "realestate";
export type StockMarket = "KR" | "JP" | "US";
export type DepositBank = "SHINHAN" | "MUFG" | "YUCHO";

export const DEPOSIT_BANKS: Record<
  DepositBank,
  { country: "KR" | "JP"; currency: AssetCurrency }
> = {
  SHINHAN: { country: "KR", currency: "KRW" },
  MUFG: { country: "JP", currency: "JPY" },
  YUCHO: { country: "JP", currency: "JPY" },
};

export interface PublicAsset {
  id: number;
  userId: number;
  familyId: number | null;
  type: AssetType;
  label: string;
  currency: AssetCurrency;
  amount: number;
  bankCode: DepositBank | null;
  accountNumber: string | null;
  hasPassword: boolean;
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
  bankCode?: DepositBank;
  accountNumber?: string;
  /** Omit on edit to keep existing; empty string clears */
  loginPassword?: string;
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

  async revealCredentials(token: string, id: number) {
    const options = await apiFetch<PublicKeyCredentialRequestOptionsJSON>(
      `/api/assets/${id}/credentials/reveal/options`,
      { method: "POST", token, body: "{}" },
    );
    const response: AuthenticationResponseJSON = await startAuthentication({ optionsJSON: options });
    return apiFetch<{ accountNumber: string | null; password: string | null }>(
      `/api/assets/${id}/credentials/reveal/verify`,
      {
        method: "POST",
        token,
        body: JSON.stringify({ challenge: options.challenge, response }),
      },
    );
  },

  listTransactions(token: string, assetId: number) {
    return apiFetch<PublicTransaction[]>(`/api/assets/${assetId}/transactions`, { token });
  },

  importStatement(token: string, assetId: number, csvText: string) {
    return apiFetch<ImportStatementResult>(`/api/assets/${assetId}/import-statement`, {
      method: "POST",
      token,
      headers: { "content-type": "text/csv" },
      body: csvText,
    });
  },

  setBalance(token: string, assetId: number, amount: number) {
    return apiFetch<PublicAsset>(`/api/assets/${assetId}/set-balance`, {
      method: "POST",
      token,
      body: JSON.stringify({ amount }),
    });
  },

  listRecurringDeposits(token: string, assetId: number) {
    return apiFetch<PublicRecurringDeposit[]>(`/api/assets/${assetId}/recurring-deposits`, { token });
  },

  createRecurringDeposit(token: string, assetId: number, body: CreateRecurringDepositInput) {
    return apiFetch<PublicRecurringDeposit>(`/api/assets/${assetId}/recurring-deposits`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
    });
  },

  updateRecurringDeposit(token: string, id: number, body: Partial<CreateRecurringDepositInput> & { isActive?: boolean }) {
    return apiFetch<PublicRecurringDeposit>(`/api/recurring-deposits/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    });
  },

  removeRecurringDeposit(token: string, id: number) {
    return apiFetch<void>(`/api/recurring-deposits/${id}`, {
      method: "DELETE",
      token,
    });
  },
};

export type BillingInterval = "MONTHLY" | "YEARLY";

export interface PublicRecurringDeposit {
  id: number;
  userId: number;
  assetId: number;
  label: string;
  amount: number;
  currency: AssetCurrency;
  billingInterval: BillingInterval;
  billingMonth: number | null;
  billingDate: number;
  isActive: boolean;
  lastAppliedOn: string | null;
  nextDueOn: string | null;
  createdAt: string;
}

export interface CreateRecurringDepositInput {
  label: string;
  amount: number;
  billingInterval?: BillingInterval;
  billingDate?: number;
  billingMonth?: number | null;
  billingAnchorDate?: string;
  isActive?: boolean;
}

export type TransactionCategory = "credit" | "debit";

export interface PublicTransaction {
  id: number;
  userId: number;
  assetId: number | null;
  category: TransactionCategory;
  amount: number;
  currency: AssetCurrency;
  date: string;
  description: string | null;
  balanceAfter: number | null;
  isShared: boolean;
  ownerName: string;
}

export interface ImportStatementResult {
  imported: number;
  skipped: number;
  transactions: PublicTransaction[];
  asset: PublicAsset;
}
