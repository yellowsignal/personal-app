import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Bell, ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";
import TopBar from "../components/TopBar";
import ScopeToggle, { type ViewScope } from "../components/ScopeToggle";
import { useLanguage } from "../i18n/LanguageContext";
import { useAuth } from "../context/AuthContext";
import {
  calendarApi,
  categoryColor,
  type CalendarCategory,
  type PublicCalendarEvent,
} from "../api/calendar";
import { ApiError } from "../api/http";

const ALL_CATEGORIES: CalendarCategory[] = [
  "personal",
  "family",
  "holiday",
  "document_expiry",
  "subscription_billing",
  "recurring_deposit",
];

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toKey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function monthBounds(year: number, month: number): { from: string; to: string } {
  const last = new Date(year, month + 1, 0).getDate();
  return {
    from: toKey(year, month, 1),
    to: toKey(year, month, last),
  };
}

function buildMonthGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function CalendarPage() {
  const { t } = useLanguage();
  const { token, user, family } = useAuth();
  const weekdays = t("calendar.weekdays").split(",");
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [scope, setScope] = useState<ViewScope>("all");
  const [activeCats, setActiveCats] = useState<Set<CalendarCategory>>(new Set(ALL_CATEGORIES));
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [events, setEvents] = useState<PublicCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState(todayKey());
  const [eventTime, setEventTime] = useState("");
  const [eventCategory, setEventCategory] = useState<"personal" | "family" | "holiday">("personal");
  const [isShared, setIsShared] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const pointerStart = useRef<{ x: number; y: number; id: number } | null>(null);
  const ignoreClick = useRef(false);

  const cells = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);
  const today = todayKey();

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const { from, to } = monthBounds(cursor.year, cursor.month);
      const items = await calendarApi.listEvents(token, from, to, scope);
      setEvents(items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("calendar.errorLoad"));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [token, cursor, scope, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredEvents = useMemo(
    () => events.filter((e) => activeCats.has(e.category)),
    [events, activeCats],
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, PublicCalendarEvent[]>();
    for (const e of filteredEvents) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return map;
  }, [filteredEvents]);

  const selectedEvents = (eventsByDate.get(selectedDate) ?? []).sort((a, b) =>
    (a.time ?? "").localeCompare(b.time ?? ""),
  );

  function toggleCategory(cat: CalendarCategory) {
    setActiveCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function changeMonth(delta: number) {
    setCursor((prev) => {
      let month = prev.month + delta;
      let year = prev.year;
      if (month < 0) {
        month = 11;
        year -= 1;
      } else if (month > 11) {
        month = 0;
        year += 1;
      }
      return { year, month };
    });
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointerStart.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    setDragging(true);
    setDragX(0);
    ignoreClick.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const start = pointerStart.current;
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      setDragX(Math.max(-120, Math.min(120, dx)));
      if (Math.abs(dx) > 12) ignoreClick.current = true;
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const start = pointerStart.current;
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    pointerStart.current = null;
    setDragging(false);
    setDragX(0);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      changeMonth(dx < 0 ? 1 : -1);
    }
  }

  function openCreate() {
    setTitle("");
    setEventDate(selectedDate);
    setEventTime("");
    setEventCategory("personal");
    setIsShared(false);
    setShowCreate(true);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!token || !title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await calendarApi.create(token, {
        title: title.trim(),
        date: eventDate,
        time: eventTime || null,
        isAllDay: !eventTime,
        category: eventCategory,
        isShared: isShared || eventCategory === "family" || eventCategory === "holiday",
      });
      setShowCreate(false);
      await load();
      setSelectedDate(eventDate);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("calendar.errorSave"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(ev: PublicCalendarEvent) {
    if (!token || !ev.editable) return;
    setError(null);
    try {
      await calendarApi.remove(token, ev.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("calendar.errorDelete"));
    }
  }

  return (
    <div>
      <TopBar
        title={t("calendar.title")}
        subtitle={t("calendar.subtitle")}
        right={
          <button
            type="button"
            onClick={openCreate}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white"
            aria-label={t("calendar.addEvent")}
          >
            <Plus size={18} />
          </button>
        }
      />

      <div className="mx-auto max-w-md px-4 pt-4 pb-8">
        <ScopeToggle value={scope} onChange={setScope} />

        {error && (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {ALL_CATEGORIES.map((cat) => {
            const active = activeCats.has(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active ? "border-transparent text-white" : "border-neutral-200 text-neutral-400"
                }`}
                style={active ? { backgroundColor: categoryColor[cat] } : undefined}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: active ? "white" : categoryColor[cat] }}
                />
                {t(`category.${cat}`)}
              </button>
            );
          })}
        </div>

        <div
          className="mt-4 touch-pan-y select-none overflow-hidden rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => changeMonth(-1)} className="p-1 text-neutral-400" aria-label={t("calendar.prevMonth")}>
              <ChevronLeft size={18} />
            </button>
            <p className="text-sm font-bold text-neutral-900">
              {t("calendar.monthYear", { year: cursor.year, month: cursor.month + 1 })}
            </p>
            <button type="button" onClick={() => changeMonth(1)} className="p-1 text-neutral-400" aria-label={t("calendar.nextMonth")}>
              <ChevronRight size={18} />
            </button>
          </div>

          <div
            className={dragging ? "" : "transition-transform duration-200"}
            style={{ transform: `translateX(${dragX}px)` }}
          >
            <div className="mt-3 grid grid-cols-7 text-center text-[11px] font-semibold text-neutral-300">
              {weekdays.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>

            <div className="mt-1 grid grid-cols-7 gap-y-1 text-center">
              {cells.map((day, idx) => {
                if (day === null) return <div key={idx} className="h-12" />;
                const key = toKey(cursor.year, cursor.month, day);
                const dayEvents = eventsByDate.get(key) ?? [];
                const isToday = key === today;
                const isSelected = key === selectedDate;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (ignoreClick.current) return;
                      setSelectedDate(key);
                    }}
                    className="flex h-12 flex-col items-center justify-start gap-1 pt-0.5"
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                        isSelected
                          ? "bg-indigo-600 text-white"
                          : isToday
                            ? "text-indigo-600"
                            : "text-neutral-700"
                      }`}
                    >
                      {day}
                    </span>
                    <div className="flex gap-0.5">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <span
                          key={ev.id}
                          className="h-1 w-1 rounded-full"
                          style={{ backgroundColor: categoryColor[ev.category] }}
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="mt-2 text-center text-[10px] text-neutral-300">{t("calendar.swipeHint")}</p>
        </div>

        <section className="mt-4">
          <h2 className="px-1 text-sm font-bold text-neutral-900">
            {t("calendar.scheduleFor", { date: selectedDate })}
          </h2>
          <div className="mt-2 flex flex-col gap-2">
            {loading && (
              <p className="rounded-2xl bg-white px-4 py-6 text-center text-xs text-neutral-300 shadow-sm ring-1 ring-black/5">
                {t("calendar.loading")}
              </p>
            )}
            {!loading && selectedEvents.length === 0 && (
              <p className="rounded-2xl bg-white px-4 py-6 text-center text-xs text-neutral-300 shadow-sm ring-1 ring-black/5">
                {t("calendar.noEvents")}
              </p>
            )}
            {selectedEvents.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/5"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: categoryColor[ev.category] }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-neutral-800">{ev.title}</p>
                  <p className="text-[11px] text-neutral-400">
                    {ev.time ?? t("calendar.allDay")} · {t(`category.${ev.category}`)}
                    {ev.isShared ? ` · ${ev.ownerName}` : ""}
                  </p>
                </div>
                {(ev.category === "document_expiry" ||
                  ev.category === "subscription_billing" ||
                  ev.category === "recurring_deposit") && (
                  <Bell size={14} className="text-rose-400" />
                )}
                {ev.editable && user?.id === ev.userId && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(ev)}
                    className="rounded-full p-2 text-neutral-400 hover:bg-neutral-50"
                    aria-label={t("calendar.deleteEvent")}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center">
          <form
            onSubmit={(e) => void handleCreate(e)}
            className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">{t("calendar.addEvent")}</h2>
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-full p-2">
                <X size={18} className="text-neutral-400" />
              </button>
            </div>
            <label className="mb-1 block text-sm font-semibold text-neutral-700">{t("calendar.fieldTitle")}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mb-3 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
            />
            <label className="mb-1 block text-sm font-semibold text-neutral-700">{t("calendar.fieldDate")}</label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="mb-3 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
            />
            <label className="mb-1 block text-sm font-semibold text-neutral-700">{t("calendar.fieldTime")}</label>
            <input
              type="time"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
              className="mb-3 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
            />
            <p className="mb-3 text-[11px] text-neutral-400">{t("calendar.timeOptionalHint")}</p>
            <label className="mb-1 block text-sm font-semibold text-neutral-700">{t("calendar.fieldCategory")}</label>
            <div className="mb-3 flex flex-wrap gap-2">
              {(["personal", "family", "holiday"] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setEventCategory(cat)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    eventCategory === cat ? "bg-indigo-600 text-white" : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {t(`category.${cat}`)}
                </button>
              ))}
            </div>
            <label className={`mb-4 flex items-center gap-2 text-sm ${family ? "text-neutral-700" : "text-neutral-400"}`}>
              <input
                type="checkbox"
                checked={isShared || eventCategory === "family" || eventCategory === "holiday"}
                disabled={!family || eventCategory === "family" || eventCategory === "holiday"}
                onChange={(e) => setIsShared(e.target.checked)}
                className="rounded border-neutral-300"
              />
              {t("calendar.shareWithFamily")}
            </label>
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {t("calendar.save")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
