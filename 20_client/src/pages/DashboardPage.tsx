import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, ChevronRight, IdCard, Images, ListChecks, Settings, Users, X } from "lucide-react";
import TopBar from "../components/TopBar";
import ScopeToggle, { type ViewScope } from "../components/ScopeToggle";
import OverlayScrim from "../components/OverlayScrim";
import ItemDetailSheet, { DetailRow } from "../components/ItemDetailSheet";
import { formatRecurrenceLabel } from "../components/RecurrencePicker";
import { useLanguage } from "../i18n/LanguageContext";
import { useCurrency } from "../context/CurrencyContext";
import { useAuth } from "../context/AuthContext";
import { currentUser, exchangeRates, familyInfo, familyMembers, type Currency } from "../mocks/data";
import { assetsApi, type PublicAsset } from "../api/assets";
import { calendarApi, categoryColor, type PublicCalendarEvent } from "../api/calendar";
import { documentsApi, type PublicDocument } from "../api/documents";
import {
  familyActivityApi,
  syncAppBadge,
  type FamilyActivitySummary,
  type PublicFamilyActivity,
} from "../api/familyActivity";
import { ApiError } from "../api/http";
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

function daysUntilIso(isoDate: string | null | undefined): number | null {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const expiry = new Date(`${isoDate}T00:00:00.000Z`);
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.ceil((expiry.getTime() - todayUtc.getTime()) / (24 * 60 * 60 * 1000));
}

function formatUpcomingWhen(e: PublicCalendarEvent): string {
  const end = e.endDate && e.endDate > e.date ? e.endDate : e.date;
  const datePart = end !== e.date ? `${e.date} ~ ${end}` : e.date;
  if (e.time) {
    const timePart =
      e.endTime && e.endTime !== e.time ? `${e.time} ~ ${e.endTime}` : e.time;
    return `${datePart} · ${timePart}`;
  }
  return datePart;
}

function reminderLabel(
  minutes: number | null | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (minutes == null) return t("calendar.reminderNone");
  if (minutes === 10) return t("calendar.reminder10m");
  if (minutes === 30) return t("calendar.reminder30m");
  if (minutes === 60) return t("calendar.reminder1h");
  if (minutes === 1440) return t("calendar.reminder1d");
  return t("calendar.reminderCustom", { n: minutes });
}

function formatDaysLeftLabel(days: number): string {
  return `D-${days}`;
}

/** Keep the soonest item per series so a recurring rule only appears once on the dashboard. */
function uniqueBySeries(events: PublicCalendarEvent[], limit: number): PublicCalendarEvent[] {
  const seen = new Set<string>();
  const out: PublicCalendarEvent[] = [];
  for (const e of events) {
    const key = e.seriesId || e.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

export default function DashboardPage() {
  const { lang, t } = useLanguage();
  const navigate = useNavigate();
  const { currency: displayCurrency, setCurrency: setDisplayCurrency } = useCurrency();
  const { token, user, family } = useAuth();
  const [scope, setScope] = useState<ViewScope>("all");
  const [assets, setAssets] = useState<PublicAsset[]>([]);
  const [docs, setDocs] = useState<PublicDocument[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<PublicCalendarEvent[]>([]);
  const [activitySummary, setActivitySummary] = useState<FamilyActivitySummary>({
    unreadCount: 0,
    latest: null,
  });
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityList, setActivityList] = useState<PublicFamilyActivity[]>([]);
  const [detailEvent, setDetailEvent] = useState<PublicCalendarEvent | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PublicCalendarEvent | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const weekdays = t("calendar.weekdays").split(",");

  useEffect(() => {
    bodyScrollRef.current?.scrollTo(0, 0);
  }, []);

  const loadAssets = useCallback(async () => {
    if (!token) return;
    try {
      const data = await assetsApi.list(token, "all");
      setAssets(data);
    } catch {
      setAssets([]);
    }
  }, [token]);

  const loadDocuments = useCallback(async () => {
    if (!token) return;
    try {
      const data = await documentsApi.list(token, "all");
      setDocs(data);
    } catch {
      setDocs([]);
    }
  }, [token]);

  const loadUpcoming = useCallback(async () => {
    if (!token) return;
    try {
      const items = await calendarApi.listEvents(token, isoToday(), isoPlusDays(60), "all");
      setUpcomingEvents(
        uniqueBySeries(
          items.filter((e) => e.category !== "holiday" && e.category !== "subscription_billing"),
          3,
        ),
      );
    } catch {
      setUpcomingEvents([]);
    }
  }, [token]);

  const loadActivitySummary = useCallback(async () => {
    if (!token) return;
    try {
      const summary = await familyActivityApi.summary(token);
      setActivitySummary(summary);
      void syncAppBadge(summary.unreadCount);
    } catch {
      setActivitySummary({ unreadCount: 0, latest: null });
    }
  }, [token]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    void loadUpcoming();
  }, [loadUpcoming]);

  useEffect(() => {
    void loadActivitySummary();
  }, [loadActivitySummary]);

  async function openActivitySheet() {
    if (!token) return;
    setActivityOpen(true);
    try {
      const list = await familyActivityApi.list(token, 40);
      setActivityList(list);
      const result = await familyActivityApi.markRead(token, { all: true });
      setActivitySummary((prev) => ({
        ...prev,
        unreadCount: result.unreadCount,
        latest: list[0] ?? null,
      }));
      void syncAppBadge(result.unreadCount);
    } catch {
      setActivityList([]);
    }
  }

  async function openActivityItem(item: PublicFamilyActivity) {
    if (!token) return;
    try {
      await familyActivityApi.markRead(token, { ids: [item.id] });
    } catch {
      /* ignore */
    }
    setActivityOpen(false);
    navigate(item.path);
  }

  function openUpcomingDetail(ev: PublicCalendarEvent) {
    setDetailEvent(ev);
  }

  function editUpcomingFromDetail(ev: PublicCalendarEvent) {
    setDetailEvent(null);
    navigate("/calendar", {
      state: { editEventId: ev.id, focusDate: ev.date },
    });
  }

  async function handleDeleteUpcomingConfirmed() {
    if (!token || !confirmDelete || !confirmDelete.editable) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await calendarApi.remove(
        token,
        confirmDelete.seriesId ?? confirmDelete.id.split(":")[0] ?? confirmDelete.id,
      );
      setConfirmDelete(null);
      setDetailEvent(null);
      await loadUpcoming();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : t("calendar.errorDelete"));
    } finally {
      setDeleting(false);
    }
  }

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

  const upcomingExpiry = useMemo(() => {
    const withExpiry = docs
      .map((doc) => ({ doc, days: daysUntilIso(doc.expiryDate) }))
      .filter((x): x is { doc: PublicDocument; days: number } => x.days != null)
      .sort((a, b) => a.days - b.days);
    return withExpiry[0] ?? null;
  }, [docs]);

  const scopeLabel = t(scope === "all" ? "scope.all" : scope === "personal" ? "scope.personal" : "scope.family");
  const latestLine = activitySummary.latest
    ? `${activitySummary.latest.actorName} · ${activitySummary.latest.title}`
    : t("dashboard.noFamilyActivity");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden overscroll-none" style={{ touchAction: "none" }}>
      <div className="shrink-0">
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
      </div>

      {/* One body scroll: nested list scroll on iOS often clips without a usable pan area. */}
      <div
        ref={bodyScrollRef}
        className="mx-auto min-h-0 w-full max-w-md flex-1 overflow-y-auto overscroll-y-contain px-4 pt-3"
        style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}
      >
        <ScopeToggle value={scope} onChange={setScope} />

        <section className="mt-3 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-500 p-4 text-white">
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
          <p className="mt-1.5 text-3xl font-bold tracking-tight">
            {CURRENCY_SYMBOL[displayCurrency]}
            {formatMoney(displayedTotal, displayCurrency)}
          </p>
          <p className="mt-1 text-[11px] text-indigo-100">
            {t("dashboard.assetsCountNote", { n: visibleAssets.length })}
          </p>
        </section>

        <section className="mt-3 grid grid-cols-2 gap-3">
          <Link
            to="/documents"
            className="rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-black/5"
          >
            <Bell size={18} className="text-rose-500" />
            <p className="mt-2 text-xs text-neutral-400">{t("dashboard.upcomingExpiry")}</p>
            <p className="mt-0.5 truncate text-sm font-bold text-neutral-900">
              {upcomingExpiry
                ? `${upcomingExpiry.doc.typeLabel} ${formatDaysLeftLabel(upcomingExpiry.days)}`
                : t("dashboard.noExpiry")}
            </p>
          </Link>
          <button
            type="button"
            onClick={() => void openActivitySheet()}
            className="rounded-2xl bg-white p-3.5 text-left shadow-sm ring-1 ring-black/5"
          >
            <div className="flex items-center justify-between">
              <Users size={18} className="text-indigo-500" />
              {activitySummary.unreadCount > 0 ? (
                <span className="min-w-[1.25rem] rounded-full bg-rose-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                  {activitySummary.unreadCount > 99 ? "99+" : activitySummary.unreadCount}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-neutral-400">{t("dashboard.familyActivity")}</p>
            <p className="mt-0.5 truncate text-sm font-bold text-neutral-900">{latestLine}</p>
          </button>
        </section>

        <section className="mt-3">
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
              <button
                key={e.id}
                type="button"
                onClick={() => openUpcomingDetail(e)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-neutral-50"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: categoryColor[e.category] }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-800">{e.title}</p>
                  <p className="text-[11px] text-neutral-400">{formatUpcomingWhen(e)}</p>
                </div>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-500">
                  {t(`category.${e.category}`)}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-3 mb-3 grid grid-cols-2 gap-3">
          <Link
            to="/checklists"
            className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-black/5"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-50">
              <ListChecks size={18} className="text-teal-600" />
            </div>
            <span className="text-sm font-semibold text-neutral-800">{t("dashboard.checklists")}</span>
          </Link>
          <Link
            to="/photos"
            className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-black/5"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50">
              <Images size={18} className="text-amber-500" />
            </div>
            <span className="text-sm font-semibold text-neutral-800">{t("dashboard.photoAlbum")}</span>
          </Link>
          <Link
            to="/documents"
            className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-black/5"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-50">
              <IdCard size={18} className="text-sky-500" />
            </div>
            <span className="text-sm font-semibold text-neutral-800">{t("nav.documents")}</span>
          </Link>
          <Link
            to="/settings"
            className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-black/5"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100">
              <Settings size={18} className="text-neutral-500" />
            </div>
            <span className="text-sm font-semibold text-neutral-800">{t("dashboard.settings")}</span>
          </Link>
        </section>
      </div>

      {activityOpen && (
        <OverlayScrim
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center"
          onDismiss={() => setActivityOpen(false)}
          label={t("dashboard.closeActivity")}
        >
          <div className="relative max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 pt-6 shadow-xl sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-neutral-900">{t("dashboard.familyActivity")}</h2>
              <button
                type="button"
                onClick={() => setActivityOpen(false)}
                className="rounded-full p-1 text-neutral-400"
                aria-label={t("dashboard.closeActivity")}
              >
                <X size={18} />
              </button>
            </div>
            {activityList.length === 0 ? (
              <p className="py-8 text-center text-xs text-neutral-400">{t("dashboard.noFamilyActivity")}</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {activityList.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => void openActivityItem(item)}
                      className="flex w-full items-start gap-3 py-3 text-left"
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                          item.isRead ? "bg-neutral-200" : "bg-rose-500"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-neutral-900">
                          {item.actorName}
                          <span className="font-medium text-neutral-400"> · </span>
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-neutral-400">
                          {t(`dashboard.activityType.${item.entityType}`)}
                          {" · "}
                          {new Date(item.createdAt).toLocaleString(lang === "ja" ? "ja-JP" : "ko-KR", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <ChevronRight size={16} className="mt-1 shrink-0 text-neutral-300" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </OverlayScrim>
      )}

      {detailEvent && (
        <ItemDetailSheet
          title={detailEvent.title}
          onClose={() => setDetailEvent(null)}
          closeLabel={t("calendar.cancelAction")}
          editLabel={t("calendar.editEvent")}
          deleteLabel={t("calendar.deleteEvent")}
          canManage={Boolean(detailEvent.editable && user?.id === detailEvent.userId)}
          onEdit={() => editUpcomingFromDetail(detailEvent)}
          onDelete={() => {
            setConfirmDelete(detailEvent);
            setDetailEvent(null);
            setDeleteError(null);
          }}
        >
          <DetailRow label={t("calendar.fieldDateFrom")}>{formatUpcomingWhen(detailEvent)}</DetailRow>
          <DetailRow label={t("calendar.fieldCategory")}>{t(`category.${detailEvent.category}`)}</DetailRow>
          {detailEvent.recurrence ? (
            <DetailRow label={t("calendar.repeat")}>
              {formatRecurrenceLabel(detailEvent.recurrence, detailEvent.date, t, weekdays)}
            </DetailRow>
          ) : null}
          {detailEvent.reminderMinutesBefore != null ? (
            <DetailRow label={t("calendar.reminder")}>
              {reminderLabel(detailEvent.reminderMinutesBefore, t)}
            </DetailRow>
          ) : null}
          {detailEvent.description ? (
            <DetailRow label={t("calendar.fieldMemo")}>
              <span className="whitespace-pre-wrap break-words text-left">{detailEvent.description}</span>
            </DetailRow>
          ) : null}
          <DetailRow label={t("calendar.shareWithFamily")}>
            {detailEvent.isShared ? t("scope.family") : t("scope.personal")}
            {` · ${detailEvent.ownerName}`}
          </DetailRow>
        </ItemDetailSheet>
      )}

      {confirmDelete && (
        <OverlayScrim
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onDismiss={() => {
            if (!deleting) setConfirmDelete(null);
          }}
          label={t("calendar.cancelAction")}
          swipeToDismiss={false}
        >
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-bold text-neutral-900">{t("calendar.deleteEvent")}</h2>
            <p className="mt-2 text-sm text-neutral-500">
              {t("calendar.deleteConfirm", { name: confirmDelete.title })}
            </p>
            {deleteError ? <p className="mt-2 text-xs text-rose-500">{deleteError}</p> : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-700 disabled:opacity-40"
              >
                {t("calendar.cancelAction")}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleDeleteUpcomingConfirmed()}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {t("calendar.deleteEvent")}
              </button>
            </div>
          </div>
        </OverlayScrim>
      )}
    </div>
  );
}
