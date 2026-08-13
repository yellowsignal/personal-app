import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronLeft, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { useAuth } from "../context/AuthContext";
import {
  assetsApi,
  type PublicAsset,
  type PublicRecurringDeposit,
  type PublicTransaction,
} from "../api/assets";
import { ApiError } from "../api/http";
import OverlayScrim from "../components/OverlayScrim";
import { formatMoney } from "../utils/formatMoney";
import { readBankCsvFile } from "../utils/readBankCsvFile";

const CURRENCY_SYMBOL = { KRW: "₩", JPY: "¥", USD: "$" };

export default function AssetStatementPage() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const { assetId: assetIdParam } = useParams();
  const assetId = Number(assetIdParam);

  const [asset, setAsset] = useState<PublicAsset | null>(null);
  const [transactions, setTransactions] = useState<PublicTransaction[]>([]);
  const [recurring, setRecurring] = useState<PublicRecurringDeposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showBalanceEdit, setShowBalanceEdit] = useState(false);
  const [balanceDraft, setBalanceDraft] = useState("");
  const [savingBalance, setSavingBalance] = useState(false);
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [recurringLabel, setRecurringLabel] = useState("");
  const [recurringAmount, setRecurringAmount] = useState("");
  const [recurringDay, setRecurringDay] = useState("15");
  const [savingRecurring, setSavingRecurring] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const canManage = user?.id === asset?.userId;

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(assetId)) return;
    setLoading(true);
    setError(null);
    try {
      const [assets, txns, rules] = await Promise.all([
        assetsApi.list(token, "all"),
        assetsApi.listTransactions(token, assetId),
        assetsApi.listRecurringDeposits(token, assetId).catch(() => [] as PublicRecurringDeposit[]),
      ]);
      const found = assets.find((a) => a.id === assetId) ?? null;
      if (!found || found.type !== "deposit") {
        setError(t("assets.statementNotFound"));
        setAsset(null);
        setTransactions([]);
        setRecurring([]);
        return;
      }
      setAsset(found);
      setTransactions(txns);
      setRecurring(rules);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("assets.statementLoadError"));
    } finally {
      setLoading(false);
    }
  }, [assetId, t, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCsvSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!token || !file || !asset) return;

    setImporting(true);
    setError(null);
    setSuccess(null);
    try {
      const csvText = await readBankCsvFile(file);
      const result = await assetsApi.importStatement(token, asset.id, csvText);
      setAsset(result.asset);
      const rows = await assetsApi.listTransactions(token, asset.id);
      setTransactions(rows);
      if (result.imported > 0) {
        setSuccess(t("assets.importSuccess", { imported: result.imported, skipped: result.skipped }));
      } else if (result.skipped > 0) {
        setSuccess(t("assets.importAllDuplicate", { skipped: result.skipped }));
      }
    } catch (err) {
      if (err instanceof Error && err.message === "EXCEL_NOT_CSV") {
        setError(t("assets.excelNotCsv"));
      } else {
        setError(err instanceof ApiError ? err.message : t("assets.importError"));
      }
    } finally {
      setImporting(false);
    }
  }

  function openBalanceEdit() {
    if (!asset) return;
    setBalanceDraft(String(asset.amount));
    setShowBalanceEdit(true);
  }

  async function submitBalance(e: FormEvent) {
    e.preventDefault();
    if (!token || !asset) return;
    const amount = Number(balanceDraft);
    if (!Number.isFinite(amount) || amount < 0) {
      setError(t("assets.balanceInvalid"));
      return;
    }
    setSavingBalance(true);
    setError(null);
    try {
      const updated = await assetsApi.setBalance(token, asset.id, amount);
      setAsset(updated);
      setShowBalanceEdit(false);
      const rows = await assetsApi.listTransactions(token, asset.id);
      setTransactions(rows);
      setSuccess(t("assets.balanceUpdated"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("assets.balanceUpdateError"));
    } finally {
      setSavingBalance(false);
    }
  }

  async function submitRecurring(e: FormEvent) {
    e.preventDefault();
    if (!token || !asset) return;
    const amount = Number(recurringAmount);
    const day = Number(recurringDay);
    if (!recurringLabel.trim() || !Number.isFinite(amount) || amount <= 0) {
      setError(t("assets.recurringInvalid"));
      return;
    }
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      setError(t("assets.recurringInvalidDay"));
      return;
    }
    setSavingRecurring(true);
    setError(null);
    try {
      await assetsApi.createRecurringDeposit(token, asset.id, {
        label: recurringLabel.trim(),
        amount,
        billingInterval: "MONTHLY",
        billingDate: day,
      });
      setShowRecurringForm(false);
      setRecurringLabel("");
      setRecurringAmount("");
      setRecurringDay("15");
      await load();
      setSuccess(t("assets.recurringCreated"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("assets.recurringSaveError"));
    } finally {
      setSavingRecurring(false);
    }
  }

  async function removeRecurring(id: number) {
    if (!token) return;
    setError(null);
    try {
      await assetsApi.removeRecurringDeposit(token, id);
      setRecurring((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("assets.recurringDeleteError"));
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f2f2f7]">
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="hidden"
        onChange={(e) => void handleCsvSelected(e)}
      />

      <header className="safe-top sticky top-0 z-10 border-b border-black/5 bg-[#f2f2f7]/95 backdrop-blur">
        <div className="flex items-center gap-1 px-2 pt-2 pb-3">
          <button
            type="button"
            onClick={() => navigate("/assets")}
            className="flex items-center gap-0.5 rounded-lg px-1 py-1 text-indigo-600 active:opacity-60"
          >
            <ChevronLeft size={28} strokeWidth={2} />
            <span className="text-[17px]">{t("assets.backToAssets")}</span>
          </button>
        </div>
        {asset && (
          <div className="px-4 pb-4">
            <p className="text-[13px] font-medium text-neutral-500">
              {asset.bankCode ? t(`depositBank.${asset.bankCode}`) : t("assetType.deposit")}
            </p>
            <h1 className="mt-0.5 text-[28px] font-bold tracking-tight text-neutral-900">{asset.label}</h1>
            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="text-2xl font-bold text-neutral-900">
                {CURRENCY_SYMBOL[asset.currency]}
                {formatMoney(asset.amount, asset.currency)}
              </p>
              {canManage && (
                <button
                  type="button"
                  onClick={openBalanceEdit}
                  className="flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-indigo-600 shadow-sm ring-1 ring-black/5"
                >
                  <Pencil size={12} />
                  {t("assets.editBalance")}
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      <div className="flex-1 px-4 pb-8">
        {error && (
          <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</p>
        )}
        {success && (
          <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{success}</p>
        )}

        {loading ? (
          <p className="py-12 text-center text-sm text-neutral-400">{t("assets.statementLoading")}</p>
        ) : (
          <>
            <section className="mt-2 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
              <div className="flex items-center justify-between px-4 py-3">
                <h2 className="text-sm font-bold text-neutral-900">{t("assets.recurringTitle")}</h2>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setShowRecurringForm(true)}
                    className="flex items-center gap-1 text-xs font-semibold text-indigo-600"
                  >
                    <Plus size={14} />
                    {t("assets.recurringAdd")}
                  </button>
                )}
              </div>
              {recurring.length === 0 ? (
                <p className="border-t border-neutral-100 px-4 py-4 text-xs text-neutral-500">
                  {t("assets.recurringEmpty")}
                </p>
              ) : (
                recurring.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-start gap-3 border-t border-neutral-100 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-neutral-900">{rule.label}</p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {t("assets.recurringMonthly", {
                          day: rule.billingDate,
                          amount: `${CURRENCY_SYMBOL[rule.currency]}${formatMoney(rule.amount, rule.currency)}`,
                        })}
                      </p>
                      {rule.nextDueOn && (
                        <p className="mt-0.5 text-[11px] text-indigo-500">
                          {t("assets.recurringNext", { date: rule.nextDueOn })}
                        </p>
                      )}
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => void removeRecurring(rule.id)}
                        className="rounded-full p-2 text-neutral-400 hover:bg-neutral-50"
                        aria-label={t("assets.recurringDelete")}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </section>

            <section className="mt-4">
              <h2 className="mb-2 px-1 text-sm font-bold text-neutral-900">{t("assets.statementTitle")}</h2>
              {transactions.length === 0 ? (
                <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                  <p className="px-4 py-10 text-center text-sm text-neutral-500">{t("assets.statementEmpty")}</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                  {transactions.map((tx, idx) => (
                    <div
                      key={tx.id}
                      className={`flex items-center gap-3 px-4 py-3.5 ${idx > 0 ? "border-t border-neutral-100" : ""}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium text-neutral-900">
                          {tx.description || t("assets.noDescription")}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-400">{tx.date}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={`text-[15px] font-semibold tabular-nums ${
                            tx.category === "credit" ? "text-emerald-600" : "text-neutral-900"
                          }`}
                        >
                          {tx.category === "credit" ? "+" : "−"}
                          {CURRENCY_SYMBOL[tx.currency]}
                          {formatMoney(tx.amount, tx.currency)}
                        </p>
                        {tx.balanceAfter != null && (
                          <p className="mt-0.5 text-[11px] tabular-nums text-neutral-400">
                            {t("assets.balanceAfter", {
                              v: `${CURRENCY_SYMBOL[tx.currency]}${formatMoney(tx.balanceAfter, tx.currency)}`,
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {canManage && (
              <button
                type="button"
                disabled={importing}
                onClick={() => csvInputRef.current?.click()}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white py-3 text-xs font-semibold text-neutral-600 disabled:opacity-50"
              >
                <Upload size={14} />
                {importing ? t("assets.importing") : t("assets.importCsvOptional")}
              </button>
            )}
          </>
        )}
      </div>

      {showBalanceEdit && asset && (
        <OverlayScrim
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center"
          onDismiss={() => setShowBalanceEdit(false)}
          label={t("assets.cancelAction")}
        >
          <form
            onSubmit={(e) => void submitBalance(e)}
            className="relative w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">{t("assets.editBalance")}</h2>
              <button type="button" onClick={() => setShowBalanceEdit(false)} className="rounded-full p-2">
                <X size={18} className="text-neutral-400" />
              </button>
            </div>
            <p className="mb-3 text-xs text-neutral-500">{t("assets.editBalanceHint")}</p>
            <label className="mb-1 block text-sm font-semibold text-neutral-700">
              {t("assets.currentBalance")} ({CURRENCY_SYMBOL[asset.currency]})
            </label>
            <input
              inputMode="decimal"
              value={balanceDraft}
              onChange={(e) => setBalanceDraft(e.target.value)}
              className="mb-4 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
            />
            <button
              type="submit"
              disabled={savingBalance}
              className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {t("assets.saveBalance")}
            </button>
          </form>
        </OverlayScrim>
      )}

      {showRecurringForm && asset && (
        <OverlayScrim
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center"
          onDismiss={() => setShowRecurringForm(false)}
          label={t("assets.cancelAction")}
        >
          <form
            onSubmit={(e) => void submitRecurring(e)}
            className="relative w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">{t("assets.recurringAdd")}</h2>
              <button type="button" onClick={() => setShowRecurringForm(false)} className="rounded-full p-2">
                <X size={18} className="text-neutral-400" />
              </button>
            </div>
            <p className="mb-3 text-xs text-neutral-500">{t("assets.recurringHint")}</p>
            <label className="mb-1 block text-sm font-semibold text-neutral-700">{t("assets.recurringLabel")}</label>
            <input
              value={recurringLabel}
              onChange={(e) => setRecurringLabel(e.target.value)}
              placeholder={t("assets.recurringLabelPlaceholder")}
              className="mb-3 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
            />
            <label className="mb-1 block text-sm font-semibold text-neutral-700">
              {t("assets.recurringAmount")} ({CURRENCY_SYMBOL[asset.currency]})
            </label>
            <input
              inputMode="decimal"
              value={recurringAmount}
              onChange={(e) => setRecurringAmount(e.target.value)}
              className="mb-3 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
            />
            <label className="mb-1 block text-sm font-semibold text-neutral-700">{t("assets.recurringDay")}</label>
            <input
              inputMode="numeric"
              value={recurringDay}
              onChange={(e) => setRecurringDay(e.target.value)}
              className="mb-4 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
            />
            <button
              type="submit"
              disabled={savingRecurring}
              className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {t("assets.recurringSave")}
            </button>
          </form>
        </OverlayScrim>
      )}
    </div>
  );
}
