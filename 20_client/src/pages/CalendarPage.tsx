import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type TransitionEvent as ReactTransitionEvent,
} from "react";
import { Bell, ChevronDown, ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";
import TopBar from "../components/TopBar";
import ScopeToggle, { type ViewScope } from "../components/ScopeToggle";
import YearMonthWheelPicker from "../components/YearMonthWheelPicker";
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

function addOneDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d! + 1);
  return toKey(dt.getFullYear(), dt.getMonth(), dt.getDate());
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
  while (cells.length < 42) cells.push(null);
  return cells;
}

function sortDayEvents(events: PublicCalendarEvent[]): PublicCalendarEvent[] {
  return [...events].sort((a, b) => {
    const rank = (c: CalendarCategory) => (c === "holiday" ? 0 : 1);
    return rank(a.category) - rank(b.category) || (a.time ?? "").localeCompare(b.time ?? "") || a.title.localeCompare(b.title);
  });
}

const MAX_GRID_PILLS = 3;

function MonthGrid({
  year,
  month,
  today,
  selectedDate,
  eventsByDate,
  onSelectDay,
}: {
  year: number;
  month: number;
  today: string;
  selectedDate: string;
  eventsByDate: Map<string, PublicCalendarEvent[]>;
  onSelectDay: (key: string) => void;
}) {
  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);
  return (
    <div className="mt-1 grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-neutral-100">
      {cells.map((day, idx) => {
        const weekday = idx % 7;
        if (day === null) {
          return <div key={idx} className="min-h-[5.5rem] bg-white" />;
        }
        const key = toKey(year, month, day);
        const dayEvents = sortDayEvents(eventsByDate.get(key) ?? []);
        const visible = dayEvents.slice(0, MAX_GRID_PILLS);
        const extra = dayEvents.length - visible.length;
        const isToday = key === today;
        const isSelected = key === selectedDate;
        const hasHoliday = dayEvents.some((e) => e.category === "holiday");
        const dateColor = isSelected
          ? "bg-indigo-600 text-white"
          : isToday
            ? "text-indigo-600 ring-1 ring-indigo-600"
            : hasHoliday || weekday === 0
              ? "text-red-500"
              : weekday === 6
                ? "text-blue-500"
                : "text-neutral-800";
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelectDay(key)}
            className={`flex min-h-[5.5rem] flex-col items-stretch px-[2px] pb-0.5 pt-0.5 text-left touch-manipulation ${
              isSelected ? "bg-indigo-50" : "bg-white"
            }`}
          >
            <span className={`mb-0.5 flex h-5 w-5 items-center justify-center self-center rounded-full text-[11px] font-semibold ${dateColor}`}>
              {day}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-px">
              {visible.map((ev) => (
                <span
                  key={ev.id}
                  title={ev.title}
                  className="block truncate rounded-[3px] px-[3px] text-[9px] font-semibold leading-[13px] text-white"
                  style={{ backgroundColor: categoryColor[ev.category] }}
                >
                  {ev.title}
                </span>
              ))}
              {extra > 0 && (
                <span className="px-[2px] text-[9px] font-semibold leading-3 text-neutral-400">+{extra}</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

type MonthCursor = { year: number; month: number };

function shiftMonth(cursor: MonthCursor, delta: number): MonthCursor {
  const d = new Date(cursor.year, cursor.month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

function clampSelectedDate(selected: string, cursor: MonthCursor): string {
  const day = Number(selected.slice(8, 10));
  const last = new Date(cursor.year, cursor.month + 1, 0).getDate();
  return toKey(cursor.year, cursor.month, Math.min(Number.isFinite(day) && day > 0 ? day : 1, last));
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
  const [eventEndDate, setEventEndDate] = useState(todayKey());
  const [eventTime, setEventTime] = useState("");
  const [eventCategory, setEventCategory] = useState<"personal" | "family" | "holiday">("personal");
  const [isShared, setIsShared] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const pageWidthRef = useRef(0);
  const dragXRef = useRef(0);
  const cursorRef = useRef(cursor);
  const animatingRef = useRef(false);
  const pendingDeltaRef = useRef<number | null>(null);
  const pointerStart = useRef<{ x: number; y: number; id: number } | null>(null);
  const axisRef = useRef<"x" | "y" | null>(null);
  const ignoreClick = useRef(false);
  const lastTap = useRef<{ key: string; at: number } | null>(null);
  const hasLoadedRef = useRef(false);
  const [pageWidth, setPageWidth] = useState(0);

  const today = todayKey();
  const prevMonth = useMemo(() => shiftMonth(cursor, -1), [cursor]);
  const nextMonth = useMemo(() => shiftMonth(cursor, 1), [cursor]);
  const monthPanes = useMemo(() => [prevMonth, cursor, nextMonth], [prevMonth, cursor, nextMonth]);

  const load = useCallback(async () => {
    if (!token) return;
    if (!hasLoadedRef.current) setLoading(true);
    setError(null);
    try {
      const from = monthBounds(prevMonth.year, prevMonth.month).from;
      const to = monthBounds(nextMonth.year, nextMonth.month).to;
      const items = await calendarApi.listEvents(token, from, to, scope);
      setEvents(items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("calendar.errorLoad"));
      setEvents([]);
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [token, prevMonth, nextMonth, scope, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const sync = () => {
      const w = el.clientWidth;
      pageWidthRef.current = w;
      setPageWidth(w);
      const track = trackRef.current;
      if (track && w > 0 && !animatingRef.current) {
        track.style.transition = "none";
        track.style.transform = `translateX(${-w + dragXRef.current}px)`;
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (pendingDeltaRef.current == null) return;
    pendingDeltaRef.current = null;
    animatingRef.current = false;
    applyOffset(0, false);
  }, [cursor]);

  const filteredEvents = useMemo(
    () => events.filter((e) => activeCats.has(e.category)),
    [events, activeCats],
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, PublicCalendarEvent[]>();
    for (const e of filteredEvents) {
      const end = e.endDate && e.endDate > e.date ? e.endDate : e.date;
      let guard = 0;
      for (let key = e.date; key <= end && guard < 366; key = addOneDay(key), guard += 1) {
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(e);
      }
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

  function applyOffset(x: number, animate: boolean) {
    dragXRef.current = x;
    const track = trackRef.current;
    const w = pageWidthRef.current;
    if (!track || w <= 0) return;
    track.style.transition = animate ? "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)" : "none";
    track.style.transform = `translateX(${-w + x}px)`;
  }

  function changeMonth(delta: number) {
    const next = shiftMonth(cursorRef.current, delta);
    cursorRef.current = next;
    setCursor(next);
    setSelectedDate((sel) => clampSelectedDate(sel, next));
  }

  function jumpToMonth(next: MonthCursor) {
    if (next.year === cursorRef.current.year && next.month === cursorRef.current.month) return;
    animatingRef.current = false;
    pendingDeltaRef.current = null;
    cursorRef.current = next;
    setCursor(next);
    setSelectedDate((sel) => clampSelectedDate(sel, next));
    applyOffset(0, false);
  }

  function goToMonth(delta: number) {
    if (delta === 0 || animatingRef.current) return;
    const w = pageWidthRef.current;
    if (w <= 0) {
      changeMonth(delta);
      return;
    }
    const target = delta < 0 ? w : -w;
    if (Math.abs(dragXRef.current - target) < 2) {
      pendingDeltaRef.current = delta;
      changeMonth(delta);
      return;
    }
    animatingRef.current = true;
    pendingDeltaRef.current = delta;
    applyOffset(target, true);
  }

  function onTrackTransitionEnd(e: ReactTransitionEvent<HTMLDivElement>) {
    if (e.target !== trackRef.current) return;
    if (e.propertyName !== "transform") return;
    const delta = pendingDeltaRef.current;
    if (delta == null) {
      animatingRef.current = false;
      return;
    }
    changeMonth(delta);
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (animatingRef.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointerStart.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    axisRef.current = null;
    ignoreClick.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const start = pointerStart.current;
    if (!start || start.id !== e.pointerId || animatingRef.current) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!axisRef.current) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      axisRef.current = Math.abs(dx) > Math.abs(dy) * 1.15 ? "x" : "y";
      if (axisRef.current === "x") {
        ignoreClick.current = true;
        e.currentTarget.style.touchAction = "none";
      }
    }
    if (axisRef.current !== "x") return;
    const w = pageWidthRef.current;
    const capped = w > 0 ? Math.max(-w, Math.min(w, dx)) : dx;
    applyOffset(capped, false);
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const start = pointerStart.current;
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const axis = axisRef.current;
    pointerStart.current = null;
    axisRef.current = null;
    e.currentTarget.style.touchAction = "";
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (axis !== "x") {
      applyOffset(0, false);
      return;
    }
    const w = pageWidthRef.current;
    const threshold = Math.max(56, w * 0.22);
    if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy) * 1.05) {
      goToMonth(dx < 0 ? 1 : -1);
    } else {
      animatingRef.current = true;
      pendingDeltaRef.current = null;
      applyOffset(0, true);
    }
  }

  function openCreate(date?: string) {
    const start = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : selectedDate;
    setTitle("");
    setEventDate(start);
    setEventEndDate(start);
    setEventTime("");
    setEventCategory("personal");
    setIsShared(false);
    setShowCreate(true);
  }

  function handleDayTap(key: string) {
    if (ignoreClick.current) return;
    const nowMs = Date.now();
    const prev = lastTap.current;
    if (prev && prev.key === key && nowMs - prev.at < 340) {
      lastTap.current = null;
      setSelectedDate(key);
      openCreate(key);
      return;
    }
    lastTap.current = { key, at: nowMs };
    setSelectedDate(key);
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
        endDate: eventEndDate || eventDate,
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
        right={
          <button
            type="button"
            onClick={() => openCreate()}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white"
            aria-label={t("calendar.addEvent")}
          >
            <Plus size={18} />
          </button>
        }
      />

      <div className="mx-auto max-w-md px-4 pt-2 pb-8">
        <ScopeToggle value={scope} onChange={setScope} />

        {error && (
          <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</p>
        )}

        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {ALL_CATEGORIES.map((cat) => {
            const active = activeCats.has(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
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

        <div className="mt-2 select-none overflow-hidden rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
          <div className="relative">
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => goToMonth(-1)}
                className="p-1 text-neutral-400"
                aria-label={t("calendar.prevMonth")}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => setShowMonthPicker(true)}
                className="flex items-center gap-0.5 rounded-lg px-2 py-1 text-sm font-bold text-neutral-900"
                aria-label={t("calendar.pickYearMonth")}
              >
                {t("calendar.monthYear", { year: cursor.year, month: cursor.month + 1 })}
                <ChevronDown size={16} className="text-neutral-400" />
              </button>
              <button
                type="button"
                onClick={() => goToMonth(1)}
                className="p-1 text-neutral-400"
                aria-label={t("calendar.nextMonth")}
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="grid grid-cols-7 text-center text-[11px] font-semibold">
              {weekdays.map((w, i) => (
                <div
                  key={w}
                  className={i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-neutral-400"}
                >
                  {w}
                </div>
              ))}
            </div>

            <div
              ref={viewportRef}
              className="touch-pan-y overflow-hidden"
              style={{ overscrollBehaviorX: "contain" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <div
                ref={trackRef}
                className="flex will-change-transform"
                onTransitionEnd={onTrackTransitionEnd}
              >
                {monthPanes.map((pane, idx) => (
                  <div
                    key={idx}
                    className="shrink-0"
                    style={
                      pageWidth > 0
                        ? { flex: `0 0 ${pageWidth}px`, width: pageWidth }
                        : { flex: "0 0 100%" }
                    }
                  >
                    <MonthGrid
                      year={pane.year}
                      month={pane.month}
                      today={today}
                      selectedDate={selectedDate}
                      eventsByDate={eventsByDate}
                      onSelectDay={handleDayTap}
                    />
                  </div>
                ))}
              </div>
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
                    {ev.endDate && ev.endDate !== ev.date
                      ? `${ev.date.slice(5).replace("-", "/")} ~ ${ev.endDate.slice(5).replace("-", "/")}`
                      : (ev.time ?? t("calendar.allDay"))}{" "}
                    · {t(`category.${ev.category}`)}
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

      {showMonthPicker && (
        <YearMonthWheelPicker
          value={cursor}
          onCancel={() => setShowMonthPicker(false)}
          onConfirm={(next) => {
            jumpToMonth(next);
            setShowMonthPicker(false);
          }}
        />
      )}

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
            <div className="mb-3 grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-neutral-700">{t("calendar.fieldDateFrom")}</label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => {
                    const next = e.target.value;
                    setEventDate(next);
                    if (eventEndDate && next > eventEndDate) setEventEndDate(next);
                  }}
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-neutral-700">{t("calendar.fieldDateTo")}</label>
                <input
                  type="date"
                  value={eventEndDate}
                  onChange={(e) => {
                    const next = e.target.value;
                    setEventEndDate(next);
                    if (eventDate && next && next < eventDate) setEventDate(next);
                  }}
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
              </div>
            </div>
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
