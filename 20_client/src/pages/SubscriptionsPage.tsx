import { useMemo, useState } from "react";
import { ExternalLink, Plus } from "lucide-react";
import TopBar from "../components/TopBar";
import ScopeToggle, { type ViewScope } from "../components/ScopeToggle";
import SharedBadge from "../components/SharedBadge";
import { exchangeRates, subscriptions } from "../mocks/data";
import { useLanguage } from "../i18n/LanguageContext";
import { useCurrency } from "../context/CurrencyContext";

const CURRENCY_SYMBOL = { KRW: "₩", JPY: "¥", USD: "$" };

export default function SubscriptionsPage() {
  const { lang, t } = useLanguage();
  const { currency } = useCurrency();
  const [scope, setScope] = useState<ViewScope>("all");

  const visible = subscriptions
    .filter((s) => (scope === "all" ? true : scope === "personal" ? !s.isShared : s.isShared))
    .sort((a, b) => a.billingDate - b.billingDate);

  const monthlyTotalBase = useMemo(
    () => visible.reduce((sum, s) => sum + s.cost * exchangeRates[s.currency], 0),
    [visible],
  );
  const monthlyTotalDisplay = monthlyTotalBase / exchangeRates[currency];

  return (
    <div>
      <TopBar
        title={t("subscriptions.title")}
        subtitle={t("subscriptions.subtitle")}
        right={
          <button className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white">
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
            {monthlyTotalDisplay.toLocaleString(undefined, { maximumFractionDigits: currency === "KRW" ? 0 : 2 })}
          </p>
          <p className="mt-1 text-[11px] text-neutral-400">{t("subscriptions.activeCount", { n: visible.length })}</p>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {visible.map((s) => (
            <div key={s.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <div className="flex items-start gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                  style={{ backgroundColor: s.color }}
                >
                  {s.serviceName[lang].slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-neutral-900">{s.serviceName[lang]}</p>
                    <SharedBadge isShared={s.isShared} />
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-400">{s.reason[lang]}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <div>
                  <p className="text-base font-bold text-neutral-900">
                    {CURRENCY_SYMBOL[s.currency]}
                    {s.cost.toLocaleString()}
                    <span className="ml-1 text-xs font-medium text-neutral-400">{t("subscriptions.perMonth")}</span>
                  </p>
                  <p className="text-[11px] text-neutral-400">{t("subscriptions.billingDay", { d: s.billingDate })}</p>
                </div>
                <a
                  href={s.cancelUrl}
                  className="flex items-center gap-1 rounded-full border border-neutral-200 px-3 py-1.5 text-[11px] font-semibold text-neutral-500"
                >
                  {t("subscriptions.cancel")} <ExternalLink size={12} />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
