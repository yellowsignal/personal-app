import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Plus, X } from "lucide-react";
import TopBar from "../components/TopBar";
import ScopeToggle, { type ViewScope } from "../components/ScopeToggle";
import SharedBadge from "../components/SharedBadge";
import { exchangeRates } from "../mocks/data";
import { useLanguage } from "../i18n/LanguageContext";
import { useCurrency } from "../context/CurrencyContext";
import { useAuth } from "../context/AuthContext";
import {
  subscriptionsApi,
  type CreateSubscriptionInput,
  type PublicSubscription,
  type SubscriptionCurrency,
} from "../api/subscriptions";
import { ApiError } from "../api/http";

const CURRENCY_SYMBOL = { KRW: "₩", JPY: "¥", USD: "$" };
const COLOR_PALETTE = ["#E50914", "#5B5BF6", "#34C759", "#8E8E93", "#FF6B81", "#FFB199"];

function serviceColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

const EMPTY_FORM: CreateSubscriptionInput = {
  serviceName: "",
  cost: 0,
  currency: "KRW",
  billingDate: 1,
  reason: "",
  cancelUrl: "",
  isShared: false,
};

export default function SubscriptionsPage() {
  const { t } = useLanguage();
  const { currency } = useCurrency();
  const { token, family } = useAuth();
  const [scope, setScope] = useState<ViewScope>("all");
  const [items, setItems] = useState<PublicSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateSubscriptionInput>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await subscriptionsApi.list(token, scope);
      setItems(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("subscriptions.loadError"));
    } finally {
      setLoading(false);
    }
  }, [scope, t, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const monthlyTotalBase = useMemo(
    () => items.reduce((sum, s) => sum + s.cost * exchangeRates[s.currency], 0),
    [items],
  );
  const monthlyTotalDisplay = monthlyTotalBase / exchangeRates[currency];

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !form.serviceName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await subscriptionsApi.create(token, {
        ...form,
        serviceName: form.serviceName.trim(),
        reason: form.reason?.trim() || undefined,
        cancelUrl: form.cancelUrl?.trim() || undefined,
      });
      setShowForm(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("subscriptions.saveError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <TopBar
        title={t("subscriptions.title")}
        subtitle={t("subscriptions.subtitle")}
        right={
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white"
            aria-label={t("subscriptions.add")}
          >
            <Plus size={18} />
          </button>
        }
      />

      <div className="mx-auto max-w-md px-4 pt-4">
        <ScopeToggle value={scope} onChange={setScope} />

        <div className="mt-4 rounded-2xl bg-neutral-900 p-4 text-white">
          <p className="text-xs text-neutral-400">{t("subscriptions.monthlyTotal", { currency })}</p>
          <p className="mt-1 text-2xl font-bold">
            {CURRENCY_SYMBOL[currency]}
            {monthlyTotalDisplay.toLocaleString(undefined, {
              maximumFractionDigits: currency === "KRW" ? 0 : 2,
            })}
          </p>
          <p className="mt-1 text-[11px] text-neutral-400">
            {t("subscriptions.activeCount", { n: items.length })}
          </p>
        </div>

        {error && (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
        )}

        {loading ? (
          <p className="mt-6 text-center text-sm text-neutral-400">{t("subscriptions.loading")}</p>
        ) : items.length === 0 ? (
          <p className="mt-6 text-center text-sm text-neutral-400">{t("subscriptions.empty")}</p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {items.map((s) => (
              <div key={s.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                    style={{ backgroundColor: serviceColor(s.serviceName) }}
                  >
                    {s.serviceName.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-neutral-900">{s.serviceName}</p>
                      <SharedBadge isShared={s.isShared} />
                    </div>
                    {s.reason && (
                      <p className="mt-0.5 text-xs text-neutral-400">{s.reason}</p>
                    )}
                    <p className="mt-0.5 text-[10px] text-neutral-300">{s.ownerName}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div>
                    <p className="text-base font-bold text-neutral-900">
                      {CURRENCY_SYMBOL[s.currency]}
                      {s.cost.toLocaleString()}
                      <span className="ml-1 text-xs font-medium text-neutral-400">
                        {t("subscriptions.perMonth")}
                      </span>
                    </p>
                    <p className="text-[11px] text-neutral-400">
                      {t("subscriptions.billingDay", { d: s.billingDate })}
                    </p>
                  </div>
                  {s.cancelUrl && s.cancelUrl !== "#" && (
                    <a
                      href={s.cancelUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 rounded-full border border-neutral-200 px-3 py-1.5 text-[11px] font-semibold text-neutral-500"
                    >
                      {t("subscriptions.cancel")} <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">{t("subscriptions.add")}</h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100"
              >
                <X size={18} />
              </button>
            </div>

            <label className="block text-xs font-semibold text-neutral-500">
              {t("subscriptions.fieldName")}
              <input
                required
                value={form.serviceName}
                onChange={(e) => setForm((f) => ({ ...f, serviceName: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base"
              />
            </label>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-neutral-500">
                {t("subscriptions.fieldCost")}
                <input
                  required
                  type="number"
                  min={0}
                  step="any"
                  value={form.cost || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, cost: Number(e.target.value) || 0 }))
                  }
                  className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base"
                />
              </label>
              <label className="block text-xs font-semibold text-neutral-500">
                {t("subscriptions.fieldCurrency")}
                <select
                  value={form.currency}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, currency: e.target.value as SubscriptionCurrency }))
                  }
                  className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base"
                >
                  <option value="KRW">KRW</option>
                  <option value="JPY">JPY</option>
                  <option value="USD">USD</option>
                </select>
              </label>
            </div>

            <label className="mt-3 block text-xs font-semibold text-neutral-500">
              {t("subscriptions.fieldBillingDay")}
              <input
                required
                type="number"
                min={1}
                max={31}
                value={form.billingDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, billingDate: Number(e.target.value) || 1 }))
                }
                className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base"
              />
            </label>

            <label className="mt-3 block text-xs font-semibold text-neutral-500">
              {t("subscriptions.fieldReason")}
              <input
                value={form.reason ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base"
              />
            </label>

            <label className="mt-3 block text-xs font-semibold text-neutral-500">
              {t("subscriptions.fieldCancelUrl")}
              <input
                type="url"
                value={form.cancelUrl ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, cancelUrl: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base"
              />
            </label>

            {family && (
              <label className="mt-4 flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={form.isShared}
                  onChange={(e) => setForm((f) => ({ ...f, isShared: e.target.checked }))}
                />
                {t("subscriptions.shareWithFamily")}
              </label>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-5 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? t("subscriptions.saving") : t("subscriptions.save")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
