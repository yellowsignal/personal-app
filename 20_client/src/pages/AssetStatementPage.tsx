import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, Upload } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useLanguage } from "../i18n/LanguageContext";
import { useAuth } from "../context/AuthContext";
import {
  assetsApi,
  type PublicAsset,
  type PublicTransaction,
} from "../api/assets";
import { ApiError } from "../api/http";
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
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const canImport = user?.id === asset?.userId;

  const load = useCallback(async () => {
    if (!token || !Number.isFinite(assetId)) return;
    setLoading(true);
    setError(null);
    try {
      const [assets, txns] = await Promise.all([
        assetsApi.list(token, "all"),
        assetsApi.listTransactions(token, assetId),
      ]);
      const found = assets.find((a) => a.id === assetId) ?? null;
      if (!found || found.type !== "deposit") {
        setError(t("assets.statementNotFound"));
        setAsset(null);
        setTransactions([]);
        return;
      }
      setAsset(found);
      setTransactions(txns);
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
          {canImport && (
            <button
              type="button"
              disabled={importing}
              onClick={() => csvInputRef.current?.click()}
              className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-indigo-600 active:opacity-60 disabled:opacity-40"
            >
              <Upload size={18} />
              {importing ? t("assets.importing") : t("assets.importCsv")}
            </button>
          )}
        </div>
        {asset && (
          <div className="px-4 pb-4">
            <p className="text-[13px] font-medium text-neutral-500">
              {asset.bankCode ? t(`depositBank.${asset.bankCode}`) : t("assetType.deposit")}
            </p>
            <h1 className="mt-0.5 text-[28px] font-bold tracking-tight text-neutral-900">{asset.label}</h1>
            <p className="mt-2 text-2xl font-bold text-neutral-900">
              {CURRENCY_SYMBOL[asset.currency]}
              {formatMoney(asset.amount, asset.currency)}
            </p>
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
        ) : transactions.length === 0 ? (
          <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            <p className="px-4 py-12 text-center text-sm text-neutral-500">{t("assets.statementEmpty")}</p>
            {canImport && (
              <div className="border-t border-neutral-100 px-4 py-4">
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => csvInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <Upload size={16} />
                  {importing ? t("assets.importing") : t("assets.importCsv")}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-2 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
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
      </div>
    </div>
  );
}
