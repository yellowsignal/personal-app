import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Eye, EyeOff, ExternalLink, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import TopBar from "../components/TopBar";
import ScopeToggle, { type ViewScope } from "../components/ScopeToggle";
import SharedBadge from "../components/SharedBadge";
import OverlayScrim from "../components/OverlayScrim";
import { exchangeRates } from "../mocks/data";
import { useLanguage } from "../i18n/LanguageContext";
import { useCurrency } from "../context/CurrencyContext";
import { useAuth } from "../context/AuthContext";
import {
  subscriptionsApi,
  type BillingInterval,
  type CreateSubscriptionInput,
  type PublicSubscription,
  type SubscriptionCurrency,
} from "../api/subscriptions";
import { ApiError } from "../api/http";
import { formatMoney } from "../utils/formatMoney";
import { isPasskeySupported } from "../api/passkey";

const CURRENCY_SYMBOL = { KRW: "₩", JPY: "¥", USD: "$" };
const COLOR_PALETTE = ["#E50914", "#5B5BF6", "#34C759", "#8E8E93", "#FF6B81", "#FFB199"];

function serviceColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function anchorFromSubscription(item: PublicSubscription): string {
  const year = new Date().getFullYear();
  const month = item.billingInterval === "YEARLY" ? (item.billingMonth ?? 1) : new Date().getMonth() + 1;
  const day = item.billingDate;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function emptyForm(currency: SubscriptionCurrency): CreateSubscriptionInput {
  return {
    serviceName: "",
    cost: 0,
    currency,
    billingInterval: "MONTHLY",
    billingAnchorDate: todayIsoDate(),
    loginId: "",
    loginPassword: "",
    reason: "",
    cancelUrl: "",
    isShared: false,
  };
}

function toForm(item: PublicSubscription): CreateSubscriptionInput {
  return {
    serviceName: item.serviceName,
    cost: item.cost,
    currency: item.currency,
    billingInterval: item.billingInterval ?? "MONTHLY",
    billingAnchorDate: anchorFromSubscription(item),
    loginId: item.loginId ?? "",
    loginPassword: "",
    reason: item.reason ?? "",
    cancelUrl: item.cancelUrl ?? "",
    isShared: item.isShared,
  };
}

export default function SubscriptionsPage() {
  const { t } = useLanguage();
  const { currency } = useCurrency();
  const { token, user, family } = useAuth();
  const [scope, setScope] = useState<ViewScope>("all");
  const [items, setItems] = useState<PublicSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<number | null>(null);
  const [editing, setEditing] = useState<PublicSubscription | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateSubscriptionInput>(() => emptyForm(currency));
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<PublicSubscription | null>(null);
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const [revealBusyId, setRevealBusyId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      // Always fetch full visible set; filter by tab on the client so
      // "personal" = everything I own (including shared-with-family).
      const data = await subscriptionsApi.list(token, "all");
      setItems(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("subscriptions.loadError"));
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
      return items.filter((s) => s.userId === user.id);
    }
    if (scope === "family") return items.filter((s) => s.isShared);
    return items;
  }, [items, scope, user]);

  const monthlyTotalBase = useMemo(
    () =>
      visible.reduce((sum, s) => {
        const monthlyCost = s.billingInterval === "YEARLY" ? s.cost / 12 : s.cost;
        return sum + monthlyCost * exchangeRates[s.currency];
      }, 0),
    [visible],
  );
  const monthlyTotalDisplay = monthlyTotalBase / exchangeRates[currency];

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(currency));
    setMenuId(null);
    setShowForm(true);
  }

  function openEdit(item: PublicSubscription) {
    setEditing(item);
    setForm(toForm(item));
    setMenuId(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm(currency));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !form.serviceName.trim()) return;
    setSubmitting(true);
    setError(null);
    const payload: CreateSubscriptionInput = {
      ...form,
      serviceName: form.serviceName.trim(),
      reason: form.reason?.trim() || undefined,
      cancelUrl: form.cancelUrl?.trim() || undefined,
      loginId: form.loginId?.trim() || undefined,
    };
    if (editing) {
      if (!form.loginPassword) {
        delete payload.loginPassword;
      }
    } else if (!form.loginPassword) {
      delete payload.loginPassword;
    }
    try {
      if (editing) {
        await subscriptionsApi.update(token, editing.id, payload);
      } else {
        await subscriptionsApi.create(token, payload);
      }
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("subscriptions.saveError"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReveal(item: PublicSubscription) {
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
      setError(t("subscriptions.passkeyRequired"));
      return;
    }
    setRevealBusyId(item.id);
    setError(null);
    try {
      const result = await subscriptionsApi.revealCredentials(token, item.id);
      setRevealed((prev) => ({ ...prev, [item.id]: result.password ?? "" }));
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null;
      if (code === "PASSKEY_REQUIRED") {
        setError(t("subscriptions.passkeyRequired"));
      } else {
        setError(err instanceof ApiError ? err.message : t("subscriptions.revealError"));
      }
    } finally {
      setRevealBusyId(null);
    }
  }

  async function handleCopyPassword(id: number, password: string) {
    try {
      await navigator.clipboard.writeText(password);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    } catch {
      /* ignore */
    }
  }

  async function handleDelete() {
    if (!token || !confirmDelete) return;
    setSubmitting(true);
    setError(null);
    try {
      await subscriptionsApi.remove(token, confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("subscriptions.deleteError"));
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
            onClick={openCreate}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white"
            aria-label={t("subscriptions.add")}
          >
            <Plus size={18} />
          </button>
        }
      />

      <div className="mx-auto max-w-md px-4 pt-4 pb-8">
        <ScopeToggle value={scope} onChange={setScope} />

        <div className="mt-4 rounded-2xl bg-neutral-900 p-4 text-white">
          <p className="text-xs text-neutral-400">{t("subscriptions.monthlyTotal", { currency })}</p>
          <p className="mt-1 text-2xl font-bold">
            {CURRENCY_SYMBOL[currency]}
            {formatMoney(monthlyTotalDisplay, currency)}
          </p>
          <p className="mt-1 text-[11px] text-neutral-400">
            {t("subscriptions.activeCount", { n: visible.length })}
          </p>
        </div>

        {error && (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
        )}

        {loading ? (
          <p className="mt-6 text-center text-sm text-neutral-400">{t("subscriptions.loading")}</p>
        ) : visible.length === 0 ? (
          <p className="mt-6 text-center text-sm text-neutral-400">{t("subscriptions.empty")}</p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {visible.map((s) => {
              const canManage = user?.id === s.userId;
              return (
                <div key={s.id} className="relative rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                      style={{ backgroundColor: serviceColor(s.serviceName) }}
                    >
                      {s.serviceName.slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-bold text-neutral-900">
                          {s.serviceName}
                        </p>
                        <SharedBadge isShared={s.isShared} />
                        {canManage && (
                          <button
                            type="button"
                            aria-label={t("subscriptions.more")}
                            onClick={() => setMenuId((id) => (id === s.id ? null : s.id))}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100"
                          >
                            <MoreHorizontal size={18} />
                          </button>
                        )}
                      </div>
                      {s.reason && (
                        <p className="mt-0.5 text-xs text-neutral-400">{s.reason}</p>
                      )}
                      {(s.isShared || scope === "family") && (
                        <p className="mt-1 inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                          {t("subscriptions.registeredBy", { name: s.ownerName })}
                        </p>
                      )}
                    </div>
                  </div>

                  {menuId === s.id && canManage && (
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
                          onClick={() => openEdit(s)}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-neutral-800 hover:bg-neutral-50"
                        >
                          <Pencil size={14} /> {t("subscriptions.edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuId(null);
                            setConfirmDelete(s);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 size={14} /> {t("subscriptions.delete")}
                        </button>
                      </div>
                    </>
                  )}

                  <div className="mt-3 flex items-center justify-between">
                    <div>
                      <p className="text-base font-bold text-neutral-900">
                        {CURRENCY_SYMBOL[s.currency]}
                        {formatMoney(s.cost, s.currency)}
                        <span className="ml-1 text-xs font-medium text-neutral-400">
                          {s.billingInterval === "YEARLY"
                            ? t("subscriptions.perYear")
                            : t("subscriptions.perMonth")}
                        </span>
                      </p>
                      <p className="text-[11px] text-neutral-400">
                        {s.billingInterval === "YEARLY"
                          ? t("subscriptions.billingYearly", {
                              m: s.billingMonth ?? 1,
                              d: s.billingDate,
                            })
                          : t("subscriptions.billingMonthly", { d: s.billingDate })}
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

                  {(s.loginId || s.hasPassword) && (
                    <div className="mt-3 rounded-xl bg-neutral-50 px-3 py-2.5">
                      <p className="text-[11px] font-semibold text-neutral-500">
                        {t("subscriptions.credentialsSection")}
                      </p>
                      {s.loginId && (
                        <p className="mt-1 break-all text-sm text-neutral-800">{s.loginId}</p>
                      )}
                      {s.hasPassword && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <p className="min-w-0 flex-1 break-all font-mono text-sm text-neutral-800">
                            {revealed[s.id] !== undefined
                              ? revealed[s.id] || "—"
                              : t("subscriptions.passwordHidden")}
                          </p>
                          <button
                            type="button"
                            disabled={revealBusyId === s.id}
                            onClick={() => void handleReveal(s)}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-white disabled:opacity-50"
                            aria-label={
                              revealed[s.id] !== undefined
                                ? t("subscriptions.hidePassword")
                                : t("subscriptions.revealPassword")
                            }
                          >
                            {revealed[s.id] !== undefined ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                          {revealed[s.id] !== undefined && revealed[s.id] && (
                            <button
                              type="button"
                              onClick={() => void handleCopyPassword(s.id, revealed[s.id]!)}
                              className="flex h-8 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-neutral-500 hover:bg-white"
                            >
                              <Copy size={14} />
                              {copiedId === s.id
                                ? t("subscriptions.copied")
                                : t("subscriptions.copyPassword")}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <OverlayScrim
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onDismiss={closeForm}
          label={t("subscriptions.cancelAction")}
        >
          <form
            onSubmit={handleSubmit}
            className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">
                {editing ? t("subscriptions.edit") : t("subscriptions.add")}
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
                {form.billingInterval === "YEARLY"
                  ? t("subscriptions.fieldCostYearly")
                  : t("subscriptions.fieldCostMonthly")}
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

            <div className="mt-3">
              <p className="text-xs font-semibold text-neutral-500">{t("subscriptions.fieldInterval")}</p>
              <div className="mt-1 grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1">
                {([
                  ["MONTHLY", "subscriptions.intervalMonthly"],
                  ["YEARLY", "subscriptions.intervalYearly"],
                ] as const).map(([value, key]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      setForm((f) => ({ ...f, billingInterval: value as BillingInterval }))
                    }
                    className={`rounded-lg py-2 text-sm font-semibold ${
                      form.billingInterval === value
                        ? "bg-white text-indigo-600 shadow-sm"
                        : "text-neutral-500"
                    }`}
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>

            <label className="mt-3 block text-xs font-semibold text-neutral-500">
              {form.billingInterval === "YEARLY"
                ? t("subscriptions.fieldBillingDateYearly")
                : t("subscriptions.fieldBillingDateMonthly")}
              <input
                required
                type="date"
                value={form.billingAnchorDate}
                onChange={(e) => setForm((f) => ({ ...f, billingAnchorDate: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base"
              />
              <span className="mt-1 block text-[11px] font-normal text-neutral-400">
                {form.billingInterval === "YEARLY"
                  ? t("subscriptions.billingDateHintYearly")
                  : t("subscriptions.billingDateHintMonthly")}
              </span>
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

            <div className="mt-4 rounded-xl border border-dashed border-neutral-200 p-3">
              <p className="text-xs font-semibold text-neutral-700">
                {t("subscriptions.credentialsSection")}
              </p>
              <p className="mt-1 text-[11px] text-neutral-400">{t("subscriptions.credentialsHint")}</p>
              <label className="mt-3 block text-xs font-semibold text-neutral-500">
                {t("subscriptions.fieldLoginId")}
                <input
                  autoComplete="off"
                  value={form.loginId ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, loginId: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base"
                />
              </label>
              <label className="mt-3 block text-xs font-semibold text-neutral-500">
                {editing
                  ? t("subscriptions.fieldLoginPasswordEdit")
                  : t("subscriptions.fieldLoginPassword")}
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.loginPassword ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, loginPassword: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-base"
                />
              </label>
            </div>

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
        </OverlayScrim>
      )}

      {confirmDelete && (
        <OverlayScrim
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onDismiss={() => setConfirmDelete(null)}
          label={t("subscriptions.cancelAction")}
        >
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-bold text-neutral-900">{t("subscriptions.delete")}</h2>
            <p className="mt-2 text-sm text-neutral-500">
              {t("subscriptions.deleteConfirm", { name: confirmDelete.serviceName })}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-600"
              >
                {t("subscriptions.cancelAction")}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleDelete()}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {t("subscriptions.delete")}
              </button>
            </div>
          </div>
        </OverlayScrim>
      )}
    </div>
  );
}
