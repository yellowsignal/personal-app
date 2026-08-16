import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Copy, Eye, EyeOff, Plus, RefreshCw, TrendingDown, TrendingUp, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import TopBar from "../components/TopBar";
import ScopeToggle, { type ViewScope } from "../components/ScopeToggle";
import SharedBadge from "../components/SharedBadge";
import OverlayScrim from "../components/OverlayScrim";
import SwipeableRow from "../components/SwipeableRow";
import ItemDetailSheet, { DetailRow } from "../components/ItemDetailSheet";
import { useLanguage } from "../i18n/LanguageContext";
import { useCurrency } from "../context/CurrencyContext";
import { useAuth } from "../context/AuthContext";
import {
  assetsApi,
  DEPOSIT_BANKS,
  type AssetCurrency,
  type AssetType,
  type CreateAssetInput,
  type DepositBank,
  type PublicAsset,
  type StockMarket,
} from "../api/assets";
import { isPasskeySupported } from "../api/passkey";
import { ApiError } from "../api/http";
import { formatMoney } from "../utils/formatMoney";
import { exchangeRates } from "../mocks/data";

const CURRENCY_SYMBOL = { KRW: "₩", JPY: "¥", USD: "$" };
const ASSET_TYPES: AssetType[] = ["deposit", "stock", "cash", "realestate"];
const MARKETS: StockMarket[] = ["KR", "JP", "US"];

// 종목의 시장은 사용자가 마지막으로 선택한 값을 기억해 두었다가 다음 입력 시 기본값으로 사용합니다.
const LAST_MARKET_STORAGE_KEY = "myfamilyhub_last_stock_market";
const LAST_BANK_STORAGE_KEY = "myfamilyhub_last_deposit_bank";

function readLastMarket(): StockMarket {
  if (typeof window === "undefined") return "KR";
  const stored = window.localStorage.getItem(LAST_MARKET_STORAGE_KEY);
  return stored === "KR" || stored === "JP" || stored === "US" ? stored : "KR";
}

function readLastBank(): DepositBank {
  if (typeof window === "undefined") return "SHINHAN";
  const stored = window.localStorage.getItem(LAST_BANK_STORAGE_KEY);
  return stored === "SHINHAN" || stored === "MUFG" || stored === "YUCHO" ? stored : "SHINHAN";
}

type FormState = {
  type: AssetType;
  label: string;
  currency: AssetCurrency;
  amount: number;
  bankCode: DepositBank;
  accountNumber: string;
  loginPassword: string;
  stockMarket: StockMarket;
  stockCode: string;
  quantity: string;
  buyPrice: string;
  isShared: boolean;
};

function emptyForm(
  currency: AssetCurrency,
  lastMarket: StockMarket,
  lastBank: DepositBank,
): FormState {
  return {
    type: "deposit",
    label: "",
    currency,
    amount: 0,
    bankCode: lastBank,
    accountNumber: "",
    loginPassword: "",
    stockMarket: lastMarket,
    stockCode: "",
    quantity: "",
    buyPrice: "",
    isShared: false,
  };
}

function toForm(item: PublicAsset, lastMarket: StockMarket, lastBank: DepositBank): FormState {
  return {
    type: item.type,
    label: item.label,
    currency: item.currency,
    amount: item.amount,
    bankCode: item.bankCode ?? lastBank,
    accountNumber: item.accountNumber ?? "",
    loginPassword: "",
    stockMarket: item.stockMarket ?? lastMarket,
    stockCode: item.stockCode ?? "",
    quantity: item.quantity != null ? String(item.quantity) : "",
    buyPrice: item.buyPrice != null ? String(item.buyPrice) : "",
    isShared: item.isShared,
  };
}

export default function AssetsPage() {
  const { t } = useLanguage();
  const { currency } = useCurrency();
  const { token, user, family } = useAuth();
  const navigate = useNavigate();
  const [scope, setScope] = useState<ViewScope>("all");
  const [items, setItems] = useState<PublicAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [swipeId, setSwipeId] = useState<number | null>(null);
  const [detail, setDetail] = useState<PublicAsset | null>(null);
  const [editing, setEditing] = useState<PublicAsset | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [lastMarket, setLastMarket] = useState<StockMarket>(readLastMarket);
  const [lastBank, setLastBank] = useState<DepositBank>(readLastBank);
  const [form, setForm] = useState<FormState>(() =>
    emptyForm(currency, readLastMarket(), readLastBank()),
  );
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<PublicAsset | null>(null);
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const [revealBusyId, setRevealBusyId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiedField, setCopiedField] = useState<"account" | "pw" | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await assetsApi.list(token, "all");
      setItems(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("assets.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (scope === "personal") {
      if (!user) return [];
      return items.filter((a) => a.userId === user.id);
    }
    if (scope === "family") return items.filter((a) => a.isShared);
    return items;
  }, [items, scope, user]);

  const totalBase = useMemo(
    () => visible.reduce((sum, a) => sum + a.amount * exchangeRates[a.currency], 0),
    [visible],
  );
  const totalDisplay = totalBase / exchangeRates[currency];

  const hasDeposit = useMemo(() => visible.some((a) => a.type === "deposit"), [visible]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(currency, lastMarket, lastBank));
    setSwipeId(null);
    setDetail(null);
    setShowForm(true);
  }

  function openCreateDeposit() {
    setEditing(null);
    setForm({ ...emptyForm(currency, lastMarket, lastBank), type: "deposit" });
    setSwipeId(null);
    setDetail(null);
    setShowForm(true);
  }

  function openDetail(item: PublicAsset) {
    setSwipeId(null);
    setDetail(item);
  }

  function openEdit(item: PublicAsset) {
    setEditing(item);
    setForm(toForm(item, lastMarket, lastBank));
    setSwipeId(null);
    setDetail(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm(currency, lastMarket, lastBank));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !form.label.trim()) return;
    setSubmitting(true);
    setError(null);

    let payload: CreateAssetInput;
    if (form.type === "stock") {
      payload = {
        type: "stock",
        label: form.label.trim(),
        stockMarket: form.stockMarket,
        stockCode: form.stockCode.trim().toUpperCase(),
        quantity: Number(form.quantity),
        buyPrice: Number(form.buyPrice),
        isShared: form.isShared,
      };
      setLastMarket(form.stockMarket);
      window.localStorage.setItem(LAST_MARKET_STORAGE_KEY, form.stockMarket);
    } else if (form.type === "deposit") {
      payload = {
        type: "deposit",
        label: form.label.trim(),
        bankCode: form.bankCode,
        amount: form.amount,
        accountNumber: form.accountNumber.trim() || undefined,
        isShared: form.isShared,
      };
      if (editing) {
        if (form.loginPassword) payload.loginPassword = form.loginPassword;
      } else if (form.loginPassword) {
        payload.loginPassword = form.loginPassword;
      }
      if (editing) {
        payload.accountNumber = form.accountNumber.trim();
      }
      setLastBank(form.bankCode);
      window.localStorage.setItem(LAST_BANK_STORAGE_KEY, form.bankCode);
    } else {
      payload = {
        type: form.type,
        label: form.label.trim(),
        currency: form.currency,
        amount: form.amount,
        isShared: form.isShared,
      };
    }

    try {
      if (editing) {
        await assetsApi.update(token, editing.id, payload);
      } else {
        await assetsApi.create(token, payload);
      }
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("assets.saveError"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!token || !confirmDelete) return;
    setSubmitting(true);
    setError(null);
    try {
      await assetsApi.remove(token, confirmDelete.id);
      setConfirmDelete(null);
      setDetail(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("assets.deleteError"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRefreshAll() {
    if (!token) return;
    setRefreshing(true);
    setError(null);
    try {
      const data = await assetsApi.refreshAllPrices(token);
      setItems(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("assets.refreshError"));
    } finally {
      setRefreshing(false);
    }
  }

  async function handleRefreshOne(id: number) {
    if (!token) return;
    setRefreshing(true);
    setError(null);
    try {
      const updated = await assetsApi.refreshPrice(token, id);
      setItems((prev) => prev.map((a) => (a.id === id ? updated : a)));
      setDetail((cur) => (cur?.id === id ? updated : cur));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("assets.refreshError"));
    } finally {
      setRefreshing(false);
    }
  }

  async function handleReveal(item: PublicAsset) {
    if (!token) return;
    if (revealed[item.id] !== undefined) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return;
    }
    if (!isPasskeySupported()) {
      setError(t("assets.passkeyRequired"));
      return;
    }
    setRevealBusyId(item.id);
    setError(null);
    try {
      const result = await assetsApi.revealCredentials(token, item.id);
      setRevealed((prev) => ({ ...prev, [item.id]: result.password ?? "" }));
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null;
      if (code === "PASSKEY_REQUIRED") {
        setError(t("assets.passkeyRequired"));
      } else {
        setError(err instanceof ApiError ? err.message : t("assets.revealError"));
      }
    } finally {
      setRevealBusyId(null);
    }
  }

  async function handleCopy(id: number, text: string, field: "account" | "pw") {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setCopiedField(field);
      window.setTimeout(() => {
        setCopiedId(null);
        setCopiedField(null);
      }, 1500);
    } catch {
      /* ignore */
    }
  }

  function openDepositStatement(asset: PublicAsset) {
    navigate(`/assets/${asset.id}/statement`);
  }

  return (
    <div>
      <TopBar
        title={t("assets.title")}
        subtitle={t("assets.subtitle")}
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleRefreshAll()}
              disabled={refreshing}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 disabled:opacity-50"
              aria-label={t("assets.refreshPrices")}
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white"
              aria-label={t("assets.add")}
            >
              <Plus size={18} />
            </button>
          </div>
        }
      />

      <div className="mx-auto max-w-md px-4 pt-4 pb-8">
        <ScopeToggle value={scope} onChange={setScope} />

        <div className="mt-4 rounded-2xl bg-neutral-900 p-4 text-white">
          <p className="text-xs text-neutral-400">{t("assets.total", { currency })}</p>
          <p className="mt-1 text-2xl font-bold">
            {CURRENCY_SYMBOL[currency]}
            {formatMoney(totalDisplay, currency)}
          </p>
          <p className="mt-1 text-[11px] text-neutral-400">
            {t("assets.countNote", { n: visible.length })}
          </p>
        </div>

        {error && (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
        )}

        {!loading && !hasDeposit && (
          <p className="mt-3 rounded-xl bg-indigo-50/70 px-4 py-3 text-xs text-indigo-700">
            {t("assets.depositCsvHint")}
          </p>
        )}

        {loading ? (
          <p className="mt-6 text-center text-sm text-neutral-400">{t("assets.loading")}</p>
        ) : visible.length === 0 ? (
          <div className="mt-6 rounded-2xl bg-white px-4 py-10 text-center shadow-sm ring-1 ring-black/5">
            <p className="text-sm font-medium text-neutral-600">{t("assets.empty")}</p>
            <p className="mt-2 text-xs text-neutral-400">{t("assets.depositCsvHint")}</p>
            <button
              type="button"
              onClick={openCreateDeposit}
              className="mt-4 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white"
            >
              {t("assets.addDeposit")}
            </button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {visible.map((a) => {
              const canManage = user?.id === a.userId;
              const gain = a.gainPercent;
              const isDeposit = a.type === "deposit";

              return (
                <SwipeableRow
                  key={a.id}
                  canDelete={canManage}
                  deleteLabel={t("assets.delete")}
                  actionOpen={swipeId === a.id}
                  onActionOpenChange={(open) => setSwipeId(open ? a.id : null)}
                  onPress={() => (isDeposit ? openDepositStatement(a) : openDetail(a))}
                  onLongPress={() => openDetail(a)}
                  onDelete={() => {
                    setSwipeId(null);
                    setConfirmDelete(a);
                  }}
                >
                  <div className={`relative p-4 ${isDeposit ? "pr-10" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-indigo-500">
                          {t(`assetType.${a.type}`)}
                          {a.bankCode ? ` · ${t(`depositBank.${a.bankCode}`)}` : ""}
                          {a.stockMarket ? ` · ${t(`stockMarket.${a.stockMarket}`)}` : ""}
                        </p>
                        <p className="mt-0.5 truncate text-sm font-bold text-neutral-900">{a.label}</p>
                        {(a.accountNumber || a.hasPassword) && (
                          <p className="mt-1 text-[11px] text-neutral-400">
                            {t("assets.hasCredentials")}
                          </p>
                        )}
                        {(a.isShared || scope === "family") && (
                          <p className="mt-1 inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                            {t("assets.registeredBy", { name: a.ownerName })}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <SharedBadge isShared={a.isShared} />
                        {a.type === "stock" && (
                          <button
                            type="button"
                            data-swipe-ignore
                            disabled={refreshing}
                            onClick={() => void handleRefreshOne(a.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 disabled:opacity-50"
                            aria-label={t("assets.refreshPrices")}
                          >
                            <RefreshCw size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex items-end justify-between gap-2">
                      <p className="text-xl font-bold text-neutral-900">
                        {CURRENCY_SYMBOL[a.currency]}
                        {formatMoney(a.amount, a.currency)}
                      </p>
                      {gain != null && (
                        <span
                          className={`flex items-center gap-0.5 text-xs font-semibold ${
                            gain >= 0 ? "text-emerald-500" : "text-rose-500"
                          }`}
                        >
                          {gain >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                          {Math.abs(gain).toFixed(1)}%
                        </span>
                      )}
                    </div>
                    {isDeposit && (
                      <ChevronRight
                        size={18}
                        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-300"
                      />
                    )}
                  </div>
                </SwipeableRow>
              );
            })}
            <p className="text-center text-[11px] text-neutral-400">{t("common.rowHint")}</p>
          </div>
        )}
      </div>

      {detail && (
        <ItemDetailSheet
          title={detail.label}
          onClose={() => setDetail(null)}
          closeLabel={t("assets.cancelAction")}
          editLabel={t("assets.edit")}
          deleteLabel={t("assets.delete")}
          canManage={user?.id === detail.userId}
          onEdit={() => openEdit(detail)}
          onDelete={() => {
            setConfirmDelete(detail);
            setDetail(null);
          }}
        >
          <DetailRow label={t("assets.fieldType")}>{t(`assetType.${detail.type}`)}</DetailRow>
          {detail.bankCode ? (
            <DetailRow label={t("assets.fieldBank")}>{t(`depositBank.${detail.bankCode}`)}</DetailRow>
          ) : null}
          {detail.stockMarket ? (
            <DetailRow label={t("assets.fieldMarket")}>{t(`stockMarket.${detail.stockMarket}`)}</DetailRow>
          ) : null}
          {detail.stockCode ? (
            <DetailRow label={t("assets.fieldStockCode")}>{detail.stockCode}</DetailRow>
          ) : null}
          {detail.quantity != null ? (
            <DetailRow label={t("assets.fieldQuantity")}>{t("assets.shares", { n: detail.quantity })}</DetailRow>
          ) : null}
          {detail.buyPrice != null ? (
            <DetailRow label={t("assets.fieldBuyPrice")}>
              {CURRENCY_SYMBOL[detail.currency]}
              {formatMoney(detail.buyPrice, detail.currency)}
            </DetailRow>
          ) : null}
          {detail.currentPrice != null ? (
            <DetailRow label={t("assets.fieldCurrentPrice")}>
              {CURRENCY_SYMBOL[detail.currency]}
              {formatMoney(detail.currentPrice, detail.currency)}
            </DetailRow>
          ) : detail.type === "stock" ? (
            <DetailRow label={t("assets.fieldCurrentPrice")}>{t("assets.noQuote")}</DetailRow>
          ) : null}
          <DetailRow label={t("assets.fieldAmount")}>
            {CURRENCY_SYMBOL[detail.currency]}
            {formatMoney(detail.amount, detail.currency)}
          </DetailRow>
          {detail.gainPercent != null ? (
            <DetailRow label={t("assets.gain")}>
              <span className={detail.gainPercent >= 0 ? "text-emerald-500" : "text-rose-500"}>
                {detail.gainPercent >= 0 ? "+" : ""}
                {detail.gainPercent.toFixed(1)}%
              </span>
            </DetailRow>
          ) : null}
          <DetailRow label={t("assets.shareWithFamily")}>
            {detail.isShared ? t("scope.family") : t("scope.personal")}
            {` · ${detail.ownerName}`}
          </DetailRow>
          {detail.type === "deposit" && (detail.accountNumber || detail.hasPassword) && (
            <div className="mt-4 rounded-xl bg-neutral-50 px-3 py-3">
              <p className="text-[11px] font-semibold text-neutral-500">
                {t("assets.credentialsSection")}
              </p>
              <p className="mt-1 text-[11px] text-neutral-400">{t("assets.credentialsHint")}</p>
              <div className="mt-3 flex items-start justify-between gap-3">
                <p className="text-xs font-semibold text-neutral-400">{t("assets.fieldAccountNumber")}</p>
                <div className="flex min-w-0 items-start gap-2">
                  <p className="min-w-0 break-all text-right font-mono text-sm text-neutral-900">
                    {detail.accountNumber || t("common.none")}
                  </p>
                  {detail.accountNumber ? (
                    <button
                      type="button"
                      onClick={() => void handleCopy(detail.id, detail.accountNumber!, "account")}
                      className="flex h-8 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-neutral-500 hover:bg-white"
                    >
                      <Copy size={14} />
                      {copiedId === detail.id && copiedField === "account"
                        ? t("assets.copied")
                        : t("assets.copyValue")}
                    </button>
                  ) : null}
                </div>
              </div>
              {detail.hasPassword && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-neutral-400">
                    {t("assets.fieldLoginPassword")}
                  </p>
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="min-w-0 break-all font-mono text-sm text-neutral-800">
                      {revealed[detail.id] !== undefined
                        ? revealed[detail.id] || "—"
                        : t("assets.passwordHidden")}
                    </p>
                    <button
                      type="button"
                      disabled={revealBusyId === detail.id}
                      onClick={() => void handleReveal(detail)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-white disabled:opacity-50"
                      aria-label={
                        revealed[detail.id] !== undefined
                          ? t("assets.hidePassword")
                          : t("assets.revealPassword")
                      }
                    >
                      {revealed[detail.id] !== undefined ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    {revealed[detail.id] !== undefined && revealed[detail.id] && (
                      <button
                        type="button"
                        onClick={() => void handleCopy(detail.id, revealed[detail.id]!, "pw")}
                        className="flex h-8 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-neutral-500 hover:bg-white"
                      >
                        <Copy size={14} />
                        {copiedId === detail.id && copiedField === "pw"
                          ? t("assets.copied")
                          : t("assets.copyValue")}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          {detail.type === "deposit" && (
            <button
              type="button"
              onClick={() => {
                setDetail(null);
                openDepositStatement(detail);
              }}
              className="mt-4 flex w-full items-center justify-center gap-1 rounded-xl bg-neutral-100 py-2.5 text-sm font-semibold text-neutral-700"
            >
              {t("assets.viewStatement")} <ChevronRight size={16} />
            </button>
          )}
          {detail.type === "stock" && (
            <button
              type="button"
              data-swipe-ignore
              disabled={refreshing}
              onClick={() => void handleRefreshOne(detail.id)}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-neutral-100 py-2.5 text-sm font-semibold text-neutral-700 disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              {t("assets.refreshPrices")}
            </button>
          )}
        </ItemDetailSheet>
      )}

      {showForm && (
        <OverlayScrim
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onDismiss={closeForm}
          label={t("assets.cancelAction")}
        >
          <form
            onSubmit={handleSubmit}
            className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">
                {editing ? t("assets.edit") : t("assets.add")}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100"
              >
                <X size={18} />
              </button>
            </div>

            <label className="block text-xs font-semibold text-neutral-500">
              {t("assets.fieldType")}
              <select
                value={form.type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, type: e.target.value as AssetType }))
                }
                className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base"
              >
                {ASSET_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`assetType.${type}`)}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-3 block text-xs font-semibold text-neutral-500">
              {t("assets.fieldLabel")}
              <input
                required
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base"
              />
            </label>

            {form.type === "stock" ? (
              <>
                <label className="mt-3 block text-xs font-semibold text-neutral-500">
                  {t("assets.fieldMarket")}
                  <select
                    value={form.stockMarket}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, stockMarket: e.target.value as StockMarket }))
                    }
                    className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base"
                  >
                    {MARKETS.map((m) => (
                      <option key={m} value={m}>
                        {t(`stockMarket.${m}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-3 block text-xs font-semibold text-neutral-500">
                  {t("assets.fieldStockCode")}
                  <input
                    required
                    value={form.stockCode}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, stockCode: e.target.value.toUpperCase() }))
                    }
                    placeholder={
                      form.stockMarket === "KR"
                        ? "005930"
                        : form.stockMarket === "JP"
                          ? "7203"
                          : "AAPL"
                    }
                    className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base uppercase"
                  />
                  <span className="mt-1 block text-[11px] font-normal text-neutral-400">
                    {t("assets.stockCodeHint")}
                  </span>
                </label>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="block text-xs font-semibold text-neutral-500">
                    {t("assets.fieldQuantity")}
                    <input
                      required
                      type="number"
                      min={0}
                      step="any"
                      value={form.quantity}
                      onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-neutral-500">
                    {t("assets.fieldBuyPrice")}
                    <input
                      required
                      type="number"
                      min={0}
                      step="any"
                      value={form.buyPrice}
                      onChange={(e) => setForm((f) => ({ ...f, buyPrice: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base"
                    />
                  </label>
                </div>
                <p className="mt-2 text-[11px] text-neutral-400">{t("assets.stockFormHint")}</p>
              </>
            ) : form.type === "deposit" ? (
              <>
                <label className="mt-3 block text-xs font-semibold text-neutral-500">
                  {t("assets.fieldBank")}
                  <select
                    required
                    value={form.bankCode}
                    onChange={(e) => {
                      const bankCode = e.target.value as DepositBank;
                      setForm((f) => ({
                        ...f,
                        bankCode,
                        currency: DEPOSIT_BANKS[bankCode].currency,
                      }));
                    }}
                    className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base"
                  >
                    <optgroup label={t("depositCountry.KR")}>
                      <option value="SHINHAN">{t("depositBank.SHINHAN")}</option>
                    </optgroup>
                    <optgroup label={t("depositCountry.JP")}>
                      <option value="MUFG">{t("depositBank.MUFG")}</option>
                      <option value="YUCHO">{t("depositBank.YUCHO")}</option>
                    </optgroup>
                  </select>
                </label>
                <label className="mt-3 block text-xs font-semibold text-neutral-500">
                  {t("assets.fieldAmount")}
                  <input
                    required
                    type="number"
                    min={0}
                    step="any"
                    value={form.amount || ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, amount: Number(e.target.value) || 0 }))
                    }
                    className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base"
                  />
                  <span className="mt-1 block text-[11px] font-normal text-neutral-400">
                    {t("assets.depositAmountHint", {
                      currency: DEPOSIT_BANKS[form.bankCode].currency,
                    })}
                  </span>
                </label>
                <label className="mt-3 block text-xs font-semibold text-neutral-500">
                  {t("assets.fieldAccountNumber")}
                  <input
                    value={form.accountNumber}
                    onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
                    autoComplete="off"
                    className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base"
                  />
                </label>
                <label className="mt-3 block text-xs font-semibold text-neutral-500">
                  {editing ? t("assets.fieldLoginPasswordEdit") : t("assets.fieldLoginPassword")}
                  <input
                    type="password"
                    value={form.loginPassword}
                    onChange={(e) => setForm((f) => ({ ...f, loginPassword: e.target.value }))}
                    autoComplete="new-password"
                    className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base"
                  />
                </label>
                <p className="mt-2 text-[11px] text-neutral-400">{t("assets.credentialsFormHint")}</p>
              </>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-neutral-500">
                  {t("assets.fieldAmount")}
                  <input
                    required
                    type="number"
                    min={0}
                    step="any"
                    value={form.amount || ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, amount: Number(e.target.value) || 0 }))
                    }
                    className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base"
                  />
                </label>
                <label className="block text-xs font-semibold text-neutral-500">
                  {t("assets.fieldCurrency")}
                  <select
                    value={form.currency}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, currency: e.target.value as AssetCurrency }))
                    }
                    className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base"
                  >
                    <option value="KRW">KRW</option>
                    <option value="JPY">JPY</option>
                    <option value="USD">USD</option>
                  </select>
                </label>
              </div>
            )}

            {family && (
              <label className="mt-4 flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={form.isShared}
                  onChange={(e) => setForm((f) => ({ ...f, isShared: e.target.checked }))}
                />
                {t("assets.shareWithFamily")}
              </label>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-5 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? t("assets.saving") : t("assets.save")}
            </button>
          </form>
        </OverlayScrim>
      )}

      {confirmDelete && (
        <OverlayScrim
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onDismiss={() => setConfirmDelete(null)}
          label={t("assets.cancelAction")}
          swipeToDismiss={false}
        >
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-bold text-neutral-900">{t("assets.delete")}</h2>
            <p className="mt-2 text-sm text-neutral-500">
              {t("assets.deleteConfirm", { name: confirmDelete.label })}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-600"
              >
                {t("assets.cancelAction")}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleDelete()}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {t("assets.delete")}
              </button>
            </div>
          </div>
        </OverlayScrim>
      )}
    </div>
  );
}
