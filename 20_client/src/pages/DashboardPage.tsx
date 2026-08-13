import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, ChevronRight, IdCard, Images, ListChecks, Settings } from "lucide-react";
import TopBar from "../components/TopBar";
import ScopeToggle, { type ViewScope } from "../components/ScopeToggle";
import { useLanguage } from "../i18n/LanguageContext";
import { useCurrency } from "../context/CurrencyContext";
import { useAuth } from "../context/AuthContext";
import {
  currentUser,
  documents,
  exchangeRates,
  familyInfo,
  familyMembers,
  subscriptions,
  type Currency,
} from "../mocks/data";
import { assetsApi, type PublicAsset } from "../api/assets";
import { calendarApi, categoryColor, type PublicCalendarEvent } from "../api/calendar";
import { formatMoney } from "../utils/formatMoney";

const CURRENCIES: Currency[] = ["KRW", "JPY", "USD"];
const CURRENCY_SYMBOL: Record<Currency, string> = { KRW: "₩", JPY: "¥", USD: "$" };

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DashboardPage() {
  const { lang, t } = useLanguage();
  const { currency: displayCurrency, setCurrency: setDisplayCurrency } = useCurrency();
  const { token, user, family } = useAuth();
  const [scope, setScope] = useState<ViewScope>("all");
  const [assets, setAssets] = useState<PublicAsset[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<PublicCalendarEvent[]>([]);

  const loadAssets = useCallback(async () => {
    if (!token) return;
    try {
      const data = await assetsApi.list(token, "all");
      setAssets(data);
    } catch {
      setAssets([]);
    }
  }, [token]);

  const loadUpcoming = useCallback(async () => {
    if (!token) return;
    try {
      const items = await calendarApi.listEvents(token, isoToday(), isoPlusDays(60), "all");
      setUpcomingEvents(items.slice(0, 3));
    } catch {
      setUpcomingEvents([]);
    }
  }, [token]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    void loadUpcoming();
  }, [loadUpcoming]);

  const displayName = user?.name || currentUser.name[lang];
  const displayFamily = family?.familyName || familyInfo.familyName[lang];
  const memberChips =
    family?.members.map((m, idx) => ({
      id: String(m.id),
      initial: m.name.trim().charAt(0).toUpperCase() || "?",
      color: ["#5B5BF6", "#FF6B81", "#34C759", "#FF9F0A", "#AF52DE"][idx % 5]!,
    })) ??
    familyMembers.map((m) => ({
      id: m.id,
      initial: m.initial[lang],
      color: m.avatarColor,
    }));

  const visibleAssets = useMemo(() => {
    if (scope === "personal") {
      if (!user) return [];
      return assets.filter((a) => a.userId === user.id);
    }
    if (scope === "family") return assets.filter((a) => a.isShared);
    return assets;
  }, [assets, scope, user]);

  const totalKRW = useMemo(
    () => visibleAssets.reduce((sum, a) => sum + a.amount * exchangeRates[a.currency], 0),
    [visibleAssets],
  );
  const displayedTotal = totalKRW / exchangeRates[displayCurrency];

  const upcomingExpiry = [...documents].sort((a, b) => a.daysLeft - b.daysLeft)[0];
  const nextBilling = [...subscriptions].sort((a, b) => a.billingDate - b.billingDate)[0];

  const scopeLabel = t(scope === "all" ? "scope.all" : scope === "personal" ? "scope.personal" : "scope.family");

  return (
    <div className="pb-4">
      <TopBar
        title={t("dashboard.greeting", { name: displayName })}
        subtitle={t("dashboard.familySubtitle", { family: displayFamily })}
        right={
          <div className="flex -space-x-2">
            {memberChips.map((m) => (
              <div
                key={m.id}
                className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white"
                style={{ backgroundColor: m.color }}
              >
                {m.initial}
              </div>
            ))}
          </div>
        }
      />

      <div className="mx-auto max-w-md px-4 pt-4">
        <ScopeToggle value={scope} onChange={setScope} />

        <section className="mt-4 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-500 p-5 text-white">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-indigo-100">{t("dashboard.totalAssets", { scope: scopeLabel })}</p>
            <div className="flex gap-1 rounded-full bg-white/15 p-0.5">
              {CURRENCIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setDisplayCurrency(c)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors ${
                    displayCurrency === c ? "bg-white text-indigo-600" : "text-indigo-100"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight">
            {CURRENCY_SYMBOL[displayCurrency]}
            {formatMoney(displayedTotal, displayCurrency)}
          </p>
          <p className="mt-1 text-[11px] text-indigo-100">
            {t("dashboard.assetsCountNote", { n: visibleAssets.length })}
          </p>
        </section>

        <section className="mt-4 grid grid-cols-2 gap-3">
          <Link
            to="/documents"
            className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5"
          >
            <Bell size={18} className="text-rose-500" />
            <p className="mt-2 text-xs text-neutral-400">{t("dashboard.upcomingExpiry")}</p>
            <p className="mt-0.5 text-sm font-bold text-neutral-900">
              {t(`documentType.${upcomingExpiry.docType}`)} D-{upcomingExpiry.daysLeft}
            </p>
          </Link>
          <Link
            to="/subscriptions"
            className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5"
          >
            <div className="h-[18px] w-[18px] rounded-full" style={{ backgroundColor: nextBilling.color }} />
            <p className="mt-2 text-xs text-neutral-400">{t("dashboard.nextBilling")}</p>
            <p className="mt-0.5 text-sm font-bold text-neutral-900">
              {nextBilling.serviceName[lang]} {t("dashboard.billingDaySuffix", { d: nextBilling.billingDate })}
            </p>
          </Link>
        </section>

        <section className="mt-5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-neutral-900">{t("dashboard.upcomingEvents")}</h2>
            <Link to="/calendar" className="flex items-center text-xs text-indigo-500">
              {t("dashboard.viewAll")} <ChevronRight size={14} />
            </Link>
          </div>
          <div className="mt-2 divide-y divide-neutral-100 rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            {upcomingEvents.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-neutral-400">{t("calendar.noEvents")}</p>
            )}
            {upcomingEvents.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: categoryColor[e.category] }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-800">{e.title}</p>
                  <p className="text-[11px] text-neutral-400">
                    {e.date} {e.time && `· ${e.time}`}
                  </p>
                </div>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-500">
                  {t(`category.${e.category}`)}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5 grid grid-cols-2 gap-3">
          <Link
            to="/checklists"
            className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-50">
              <ListChecks size={18} className="text-teal-600" />
            </div>
            <span className="text-sm font-semibold text-neutral-800">{t("dashboard.checklists")}</span>
          </Link>
          <Link
            to="/photos"
            className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50">
              <Images size={18} className="text-amber-500" />
            </div>
            <span className="text-sm font-semibold text-neutral-800">{t("dashboard.photoAlbum")}</span>
          </Link>
          <Link
            to="/documents"
            className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-50">
              <IdCard size={18} className="text-sky-500" />
            </div>
            <span className="text-sm font-semibold text-neutral-800">{t("nav.documents")}</span>
          </Link>
          <Link
            to="/settings"
            className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100">
              <Settings size={18} className="text-neutral-500" />
            </div>
            <span className="text-sm font-semibold text-neutral-800">{t("dashboard.settings")}</span>
          </Link>
        </section>
      </div>
    </div>
  );
}
