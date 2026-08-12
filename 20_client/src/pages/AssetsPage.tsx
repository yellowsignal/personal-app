import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2, TrendingDown, TrendingUp, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import TopBar from "../components/TopBar";
import ScopeToggle, { type ViewScope } from "../components/ScopeToggle";
import SharedBadge from "../components/SharedBadge";
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
  const [menuId, setMenuId] = useState<number | null>(null);
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
    setMenuId(null);
    setShowForm(true);
  }

  function openCreateDeposit() {
    setEditing(null);
    setForm({ ...emptyForm(currency, lastMarket, lastBank), type: "deposit" });
    setMenuId(null);
    setShowForm(true);
  }

  function openEdit(item: PublicAsset) {
    setEditing(item);
    setForm(toForm(item, lastMarket, lastBank));
    setMenuId(null);
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
        isShared: form.isShared,
      };
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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("assets.refreshError"));
    } finally {
      setRefreshing(false);
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

              if (a.type === "deposit") {
                return (
                  <div
                    key={a.id}
                    className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5"
                  >
                    <button
                      type="button"
                      onClick={() => openDepositStatement(a)}
                      className="flex w-full items-center gap-2 p-4 pr-12 text-left active:bg-neutral-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-indigo-500">
                          {t("assetType.deposit")}
                          {a.bankCode ? ` · ${t(`depositBank.${a.bankCode}`)}` : ""}
                        </p>
                        <p className="mt-0.5 truncate text-sm font-bold text-neutral-900">{a.label}</p>
                        {(a.isShared || scope === "family") && (
                          <p className="mt-1 inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                            {t("assets.registeredBy", { name: a.ownerName })}
                          </p>
                        )}
                        <p className="mt-2 text-xl font-bold text-neutral-900">
                          {CURRENCY_SYMBOL[a.currency]}
                          {formatMoney(a.amount, a.currency)}
                        </p>
                      </div>
                      <ChevronRight size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-300" />
                    </button>

                    <div className="absolute right-10 top-3 flex items-center gap-1">
                      <SharedBadge isShared={a.isShared} />
                      {canManage && (
                        <button
                          type="button"
                          aria-label={t("assets.more")}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuId((id) => (id === a.id ? null : a.id));
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100"
                        >
                          <MoreHorizontal size={18} />
                        </button>
                      )}
                    </div>

                    {menuId === a.id && canManage && (
                      <>
                        <button
                          type="button"
                          className="fixed inset-0 z-40"
                          aria-label="close menu"
                          onClick={() => setMenuId(null)}
                        />
                        <div className="absolute right-3 top-12 z-50 min-w-[140px] overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-black/10">
                          <button
                            type="button"
                            onClick={() => openEdit(a)}
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-neutral-800 hover:bg-neutral-50"
                          >
                            <Pencil size={14} /> {t("assets.edit")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMenuId(null);
                              setConfirmDelete(a);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 size={14} /> {t("assets.delete")}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              }

              return (
                <div key={a.id} className="relative rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-indigo-500">
                        {t(`assetType.${a.type}`)}
                        {a.stockMarket ? ` · ${t(`stockMarket.${a.stockMarket}`)}` : ""}
                      </p>
                      <p className="mt-0.5 truncate text-sm font-bold text-neutral-900">{a.label}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <SharedBadge isShared={a.isShared} />
                      {a.type === "stock" && (
                        <button
                          type="button"
                          disabled={refreshing}
                          onClick={() => void handleRefreshOne(a.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 disabled:opacity-50"
                          aria-label={t("assets.refreshPrices")}
                        >
                          <RefreshCw size={14} />
                        </button>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          aria-label={t("assets.more")}
                          onClick={() => setMenuId((id) => (id === a.id ? null : a.id))}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100"
                        >
                          <MoreHorizontal size={18} />
                        </button>
                      )}
                    </div>
                  </div>

                  {(a.isShared || scope === "family") && (
                    <p className="mt-1 inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                      {t("assets.registeredBy", { name: a.ownerName })}
                    </p>
                  )}

                  {menuId === a.id && canManage && (
                    <>
                      <button
                        type="button"
                        className="fixed inset-0 z-40"
                        aria-label="close menu"
                        onClick={() => setMenuId(null)}
                      />
                      <div className="absolute right-3 top-12 z-50 min-w-[140px] overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-black/10">
                        <button
                          type="button"
                          onClick={() => openEdit(a)}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-neutral-800 hover:bg-neutral-50"
                        >
                          <Pencil size={14} /> {t("assets.edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuId(null);
                            setConfirmDelete(a);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 size={14} /> {t("assets.delete")}
                        </button>
                      </div>
                    </>
                  )}

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

                  {a.type === "stock" && (
                    <div className="mt-2 space-y-1 rounded-lg bg-neutral-50 px-3 py-2 text-[11px] text-neutral-500">
                      <div className="flex justify-between gap-2">
                        <span>{a.stockCode}</span>
                        <span>
                          {a.quantity != null
                            ? t("assets.shares", { n: a.quantity })
                            : ""}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span>
                          {a.buyPrice != null
                            ? t("assets.buyPrice", {
                                v: formatMoney(a.buyPrice, a.currency),
                              })
                            : ""}
                        </span>
                        <span>
                          {a.currentPrice != null
                            ? t("assets.currentPrice", {
                                v: formatMoney(a.currentPrice, a.currency),
                              })
                            : t("assets.noQuote")}
                        </span>
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <form
            onSubmit={handleSubmit}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
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
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
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
        </div>
      )}
    </div>
  );
}
