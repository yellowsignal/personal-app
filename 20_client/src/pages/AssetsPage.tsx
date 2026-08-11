import { useState } from "react";
import { Plus, TrendingDown, TrendingUp } from "lucide-react";
import TopBar from "../components/TopBar";
import ScopeToggle, { type ViewScope } from "../components/ScopeToggle";
import SharedBadge from "../components/SharedBadge";
import { assets } from "../mocks/data";
import { useLanguage } from "../i18n/LanguageContext";
import { formatMoney } from "../utils/formatMoney";

const CURRENCY_SYMBOL = { KRW: "₩", JPY: "¥", USD: "$" };

export default function AssetsPage() {
  const { lang, t } = useLanguage();
  const [scope, setScope] = useState<ViewScope>("all");

  const visible = assets.filter((a) =>
    scope === "all" ? true : scope === "personal" ? !a.isShared : a.isShared,
  );

  return (
    <div>
      <TopBar
        title={t("assets.title")}
        subtitle={t("assets.subtitle")}
        right={
          <button className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white">
            <Plus size={18} />
          </button>
        }
      />

      <div className="mx-auto max-w-md px-4 pt-4">
        <ScopeToggle value={scope} onChange={setScope} />

        <div className="mt-4 flex flex-col gap-3">
          {visible.map((a) => (
            <div key={a.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-indigo-500">{t(`assetType.${a.type}`)}</p>
                  <p className="mt-0.5 text-sm font-bold text-neutral-900">{a.label[lang]}</p>
                </div>
                <SharedBadge isShared={a.isShared} />
              </div>

              <div className="mt-3 flex items-end justify-between">
                <p className="text-xl font-bold text-neutral-900">
                  {CURRENCY_SYMBOL[a.currency]}
                  {formatMoney(a.amount, a.currency)}
                </p>
                {a.changePercent !== undefined && (
                  <span
                    className={`flex items-center gap-0.5 text-xs font-semibold ${
                      a.changePercent >= 0 ? "text-emerald-500" : "text-rose-500"
                    }`}
                  >
                    {a.changePercent >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                    {Math.abs(a.changePercent)}%
                  </span>
                )}
              </div>

              {a.stockCode && (
                <div className="mt-2 flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 text-[11px] text-neutral-500">
                  <span>
                    {t("assets.buyPrice", {
                      v:
                        a.buyPrice !== undefined
                          ? formatMoney(a.buyPrice, a.currency)
                          : "",
                    })}
                  </span>
                  <span>
                    {t("assets.currentPrice", {
                      v:
                        a.currentPrice !== undefined
                          ? formatMoney(a.currentPrice, a.currency)
                          : "",
                    })}
                  </span>
                  <span className="font-mono text-neutral-400">{a.stockCode}</span>
                </div>
              )}

              <p className="mt-2 text-[11px] text-neutral-400">{a.owner[lang]}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
