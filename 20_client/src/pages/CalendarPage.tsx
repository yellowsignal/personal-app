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
import { Bell, ChevronDown, ChevronLeft, ChevronRight, Plus, Repeat, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import TopBar from "../components/TopBar";
import ScopeToggle, { type ViewScope } from "../components/ScopeToggle";
import YearMonthWheelPicker from "../components/YearMonthWheelPicker";
import OverlayScrim from "../components/OverlayScrim";
import SwipeableRow from "../components/SwipeableRow";
import ItemDetailSheet, { DetailRow } from "../components/ItemDetailSheet";
import RecurrencePicker, {
  draftFromRecurrence,
  emptyRecurrenceDraft,
  formatRecurrenceLabel,
  recurrenceFromDraft,
  weekdayFromKey,
  type RecurrenceDraft,
} from "../components/RecurrencePicker";
import { useLanguage } from "../i18n/LanguageContext";
import { useAuth } from "../context/AuthContext";
import {
  calendarApi,
  categoryColor,
  type CalendarCategory,
  type PublicCalendarEvent,
} from "../api/calendar";
import { ApiError } from "../api/http";
import { enableHomeScreenPush } from "../api/push";
import { LONG_PRESS_MS } from "../utils/swipeGesture";
import { useKeepFocusedInScrollParent } from "../hooks/useKeepFocusedInScrollParent";
import {
  ALL_CALENDAR_CATEGORIES as ALL_CATEGORIES,
  readActiveCalendarCategories,
  toggleCalendarCategory,
  writeActiveCalendarCategories,
} from "../utils/calendarCategoryFilters";

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

function addOneHour(date: string, time: string): { date: string; time: string } {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const dt = new Date(y!, m! - 1, d!, hh ?? 0, mm ?? 0);
  dt.setHours(dt.getHours() + 1);
  return {
    date: toKey(dt.getFullYear(), dt.getMonth(), dt.getDate()),
    time: `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`,
  };
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

function eventEndKey(e: PublicCalendarEvent): string {
  // All-day recurring instances are discrete days; never paint a multi-day bar.
  if (e.recurrence && e.isAllDay) return e.date;
  return e.endDate && e.endDate > e.date ? e.endDate : e.date;
}

const MAX_GRID_LANES = 3;
const GRID_LANE_H = 14;

type WeekSeg = {
  event: PublicCalendarEvent;
  startCol: number;
  span: number;
  continuesLeft: boolean;
  continuesRight: boolean;
};

function uniqueMonthEvents(eventsByDate: Map<string, PublicCalendarEvent[]>): PublicCalendarEvent[] {
  const map = new Map<string, PublicCalendarEvent>();
  for (const list of eventsByDate.values()) {
    for (const e of list) map.set(e.id, e);
  }
  return [...map.values()];
}

function segmentInWeek(ev: PublicCalendarEvent, keys: (string | null)[]): WeekSeg | null {
  const end = eventEndKey(ev);
  let startCol = -1;
  let endCol = -1;
  for (let i = 0; i < 7; i++) {
    const key = keys[i];
    if (!key) continue;
    if (key >= ev.date && key <= end) {
      if (startCol < 0) startCol = i;
      endCol = i;
    }
  }
  if (startCol < 0 || endCol < 0) return null;
  const startKey = keys[startCol];
  const endKey = keys[endCol];
  return {
    event: ev,
    startCol,
    span: endCol - startCol + 1,
    continuesLeft: Boolean(startKey && ev.date < startKey),
    continuesRight: Boolean(endKey && end > endKey),
  };
}

function packWeekLanes(segs: WeekSeg[]): WeekSeg[][] {
  const lanes: WeekSeg[][] = [];
  const sorted = [...segs].sort((a, b) => {
    const rank = (c: CalendarCategory) => (c === "holiday" || c === "company" ? 0 : 1);
    const dur = (s: WeekSeg) => s.span;
    return (
      rank(a.event.category) - rank(b.event.category) ||
      dur(b) - dur(a) ||
      a.event.date.localeCompare(b.event.date) ||
      a.event.title.localeCompare(b.event.title)
    );
  });
  for (const seg of sorted) {
    const lane = lanes.find((items) =>
      items.every((s) => seg.startCol + seg.span <= s.startCol || s.startCol + s.span <= seg.startCol),
    );
    if (lane) lane.push(seg);
    else lanes.push([seg]);
  }
  return lanes;
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

function clockAfterMinutes(date: string, minutesFromMidnight: number): { date: string; time: string } {
  const base = new Date(`${date}T00:00:00.000Z`);
  base.setUTCMinutes(minutesFromMidnight);
  return {
    date: `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(base.getUTCDate()).padStart(2, "0")}`,
    time: `${String(base.getUTCHours()).padStart(2, "0")}:${String(base.getUTCMinutes()).padStart(2, "0")}`,
  };
}

function reminderFireHint(
  eventDate: string,
  eventTime: string,
  minutes: number | null,
  t: (key: string, params?: Record<string, string | number>) => string,
): string | null {
  if (minutes == null || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null;
  if (!eventTime) {
    const fire = clockAfterMinutes(eventDate, 9 * 60 - minutes);
    return t("calendar.reminderFiresAt", { date: fire.date, time: fire.time });
  }
  if (!/^\d{2}:\d{2}$/.test(eventTime)) return null;
  const [hh, mm] = eventTime.split(":").map(Number);
  const fire = clockAfterMinutes(eventDate, hh * 60 + mm - minutes);
  return t("calendar.reminderFiresAt", { date: fire.date, time: fire.time });
}

const REMINDER_CHOICES: Array<number | null> = [null, 10, 30, 60, 1440];

function MonthGrid({
  year,
  month,
  today,
  selectedDate,
  eventsByDate,
  onSelectDay,
  onOpenEvent,
}: {
  year: number;
  month: number;
  today: string;
  selectedDate: string;
  eventsByDate: Map<string, PublicCalendarEvent[]>;
  onSelectDay: (key: string) => void;
  onOpenEvent: (ev: PublicCalendarEvent, dayKey: string) => void;
}) {
  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const allEvents = useMemo(() => uniqueMonthEvents(eventsByDate), [eventsByDate]);
  const weeks = useMemo(() => {
    const rows: Array<Array<number | null>> = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [cells]);
  const longPressTimer = useRef<number | null>(null);
  const longPressEvent = useRef<PublicCalendarEvent | null>(null);
  const openedByLongPress = useRef(false);

  function clearLongPress() {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressEvent.current = null;
  }

  function openSeg(ev: PublicCalendarEvent, dayKey: string, fromLongPress: boolean) {
    if (fromLongPress) openedByLongPress.current = true;
    onOpenEvent(ev, dayKey);
  }

  return (
    <div className="mt-1 overflow-hidden rounded-lg bg-neutral-100 ring-1 ring-neutral-100">
      {weeks.map((week, wi) => {
        const keys = week.map((day) => (day == null ? null : toKey(year, month, day)));
        const visibleKeys = keys.filter((k): k is string => Boolean(k));
        const weekFrom = visibleKeys[0] ?? "";
        const weekTo = visibleKeys[visibleKeys.length - 1] ?? "";
        const segs = allEvents
          .filter((ev) => weekFrom && eventEndKey(ev) >= weekFrom && ev.date <= weekTo)
          .map((ev) => segmentInWeek(ev, keys))
          .filter((s): s is WeekSeg => Boolean(s));
        const lanes = packWeekLanes(segs);
        const visibleLanes = lanes.slice(0, MAX_GRID_LANES);
        const hidden = lanes.slice(MAX_GRID_LANES).flat();
        return (
          <div key={wi} className="grid grid-cols-7 border-b border-neutral-100 last:border-b-0">
            {week.map((day, col) => {
              if (day === null) {
                return <div key={`${wi}-${col}`} className="min-h-[5.5rem] bg-white" />;
              }
              const key = toKey(year, month, day);
              const weekday = col;
              const isToday = key === today;
              const isSelected = key === selectedDate;
              const dayEvents = eventsByDate.get(key) ?? [];
              const hasHoliday = dayEvents.some((e) => e.category === "holiday");
              const hasCompanyOff = dayEvents.some((e) => e.category === "company" && e.description !== "work");
              const extra = hidden.filter((s) => key >= s.event.date && key <= eventEndKey(s.event)).length;
              const dateColor = isSelected
                ? "bg-indigo-600 text-white"
                : isToday
                  ? "text-indigo-600 ring-1 ring-indigo-600"
                  : hasHoliday || weekday === 0
                    ? "text-red-500"
                    : hasCompanyOff
                      ? "text-amber-500"
                      : weekday === 6
                        ? "text-blue-500"
                        : "text-neutral-800";
              return (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectDay(key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectDay(key);
                    }
                  }}
                  className={`relative flex min-h-[5.5rem] cursor-pointer flex-col overflow-visible px-[2px] pb-0.5 pt-0.5 text-left touch-manipulation ${
                    isSelected ? "bg-indigo-50" : "bg-white"
                  }`}
                >
                  <span
                    className={`mb-0.5 flex h-5 w-5 items-center justify-center self-center rounded-full text-[11px] font-semibold ${dateColor}`}
                  >
                    {day}
                  </span>
                  <div className="relative min-h-0 flex-1">
                    {visibleLanes.map((lane, li) => {
                      const seg = lane.find((s) => s.startCol === col);
                      if (!seg) return <div key={li} className="h-[13px]" />;
                      const radius = [
                        seg.continuesLeft ? "rounded-l-none" : "rounded-l-[3px]",
                        seg.continuesRight ? "rounded-r-none" : "rounded-r-[3px]",
                      ].join(" ");
                      return (
                        <button
                          key={seg.event.id}
                          type="button"
                          title={seg.event.title}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (openedByLongPress.current) {
                              openedByLongPress.current = false;
                              return;
                            }
                            clearLongPress();
                            openSeg(seg.event, key, false);
                          }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            clearLongPress();
                            longPressEvent.current = seg.event;
                            longPressTimer.current = window.setTimeout(() => {
                              if (longPressEvent.current) openSeg(longPressEvent.current, key, true);
                              clearLongPress();
                            }, LONG_PRESS_MS);
                          }}
                          onPointerUp={clearLongPress}
                          onPointerCancel={clearLongPress}
                          onPointerLeave={clearLongPress}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            clearLongPress();
                            openSeg(seg.event, key, true);
                          }}
                          className={`absolute truncate px-[3px] text-left text-[9px] font-semibold leading-[13px] text-white ${radius}`}
                          style={{
                            top: li * GRID_LANE_H,
                            left: 0,
                            width: `calc(${seg.span} * 100% - 1px)`,
                            height: 13,
                            backgroundColor: categoryColor[seg.event.category],
                            zIndex: 2,
                          }}
                        >
                          {seg.event.title}
                        </button>
                      );
                    })}
                    {extra > 0 && (
                      <span className="px-[2px] text-[9px] font-semibold leading-3 text-neutral-400">+{extra}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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
  const location = useLocation();
  const navigate = useNavigate();
  const weekdays = t("calendar.weekdays").split(",");
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [scope, setScope] = useState<ViewScope>("all");
  const [activeCats, setActiveCats] = useState<Set<CalendarCategory>>(() => readActiveCalendarCategories());
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [events, setEvents] = useState<PublicCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingEvent, setEditingEvent] = useState<PublicCalendarEvent | null>(null);
  const formScrollRef = useRef<HTMLFormElement>(null);
  useKeepFocusedInScrollParent(showCreate, formScrollRef);
  const [detailEvent, setDetailEvent] = useState<PublicCalendarEvent | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PublicCalendarEvent | null>(null);
  const [swipeId, setSwipeId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");
  const [eventDate, setEventDate] = useState(todayKey());
  const [eventEndDate, setEventEndDate] = useState(todayKey());
  const [eventTime, setEventTime] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");
  const [eventCategory, setEventCategory] = useState<"personal" | "family" | "holiday">("personal");
  const [isShared, setIsShared] = useState(true);
  const [repeatDraft, setRepeatDraft] = useState<RecurrenceDraft>(() => emptyRecurrenceDraft(todayKey()));
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(60);
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
  const [pendingEdit, setPendingEdit] = useState<{ id: string; date: string } | null>(null);
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
    const st = location.state as { editEventId?: string; focusDate?: string } | null;
    if (!st?.editEventId) return;
    const focusDate = st.focusDate && /^\d{4}-\d{2}-\d{2}$/.test(st.focusDate) ? st.focusDate : todayKey();
    setPendingEdit({ id: st.editEventId, date: focusDate });
    const y = Number(focusDate.slice(0, 4));
    const m = Number(focusDate.slice(5, 7)) - 1;
    if (Number.isFinite(y) && Number.isFinite(m) && m >= 0 && m <= 11) {
      setCursor({ year: y, month: m });
    }
    setSelectedDate(focusDate);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

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
      const end = eventEndKey(e);
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
      const next = toggleCalendarCategory(prev, cat);
      writeActiveCalendarCategories(next);
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
    setEditingEvent(null);
    setDetailEvent(null);
    setSwipeId(null);
    setTitle("");
    setMemo("");
    setEventDate(start);
    setEventEndDate(start);
    setEventTime("");
    setEventEndTime("");
    setEventCategory("personal");
    setIsShared(Boolean(family));
    setRepeatDraft(emptyRecurrenceDraft(start));
    setReminderMinutes(60);
    setFormError(null);
    setShowCreate(true);
  }

  function openDetail(ev: PublicCalendarEvent, dayKey?: string) {
    setSwipeId(null);
    if (dayKey) setSelectedDate(dayKey);
    setDetailEvent(ev);
  }

  function openEdit(ev: PublicCalendarEvent) {
    if (!ev.editable || user?.id !== ev.userId) return;
    const cat =
      ev.category === "family" || ev.category === "holiday" || ev.category === "personal"
        ? ev.category
        : "personal";
    setEditingEvent(ev);
    setDetailEvent(null);
    setSwipeId(null);
    setTitle(ev.title);
    setMemo(ev.description ?? "");
    setEventDate(ev.date);
    setEventEndDate(ev.endDate || ev.date);
    setEventTime(ev.time ?? "");
    setEventEndTime(ev.endTime ?? "");
    setEventCategory(cat);
    setIsShared(ev.isShared);
    setRepeatDraft(draftFromRecurrence(ev.recurrence, ev.date));
    setReminderMinutes(ev.reminderMinutesBefore ?? null);
    setFormError(null);
    setShowCreate(true);
  }

  useEffect(() => {
    if (!pendingEdit || loading) return;
    const rootId = pendingEdit.id.split(":")[0] ?? pendingEdit.id;
    const match =
      events.find((e) => e.id === pendingEdit.id) ??
      events.find(
        (e) => e.date === pendingEdit.date && (e.seriesId === rootId || e.id === rootId),
      );
    setPendingEdit(null);
    if (!match) return;
    if (match.editable && user?.id === match.userId) {
      openEdit(match);
    } else {
      openDetail(match, pendingEdit.date);
    }
    // One-shot deep link from dashboard; openEdit/openDetail close over latest setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEdit, events, loading, user?.id]);

  function closeForm() {
    setShowCreate(false);
    setEditingEvent(null);
    setFormError(null);
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

  async function handleSaveEvent(e: FormEvent) {
    e.preventDefault();
    if (!token || !title.trim()) return;
    setSubmitting(true);
    setFormError(null);
    const hasRecurrence = recurrenceFromDraft(repeatDraft, eventDate) != null;
    const allDay = !eventTime && !eventEndTime;
    const payload = {
      title: title.trim(),
      description: memo.trim() || null,
      date: eventDate,
      endDate: hasRecurrence && allDay ? eventDate : eventEndDate || eventDate,
      time: eventTime || null,
      endTime: eventEndTime || null,
      isAllDay: allDay,
      category: eventCategory,
      isShared: isShared || eventCategory === "family" || eventCategory === "holiday",
      recurrence: recurrenceFromDraft(repeatDraft, eventDate),
      reminderMinutesBefore: reminderMinutes,
    };
    try {
      // Subscribe before create so the server-side reminder kick can deliver immediately.
      if (reminderMinutes != null) {
        try {
          await enableHomeScreenPush(token);
        } catch {
          /* permission / unsupported — create still proceeds */
        }
      }
      if (editingEvent) {
        const id = editingEvent.seriesId ?? editingEvent.id.split(":")[0] ?? editingEvent.id;
        await calendarApi.update(token, id, payload);
      } else {
        await calendarApi.create(token, payload);
      }
      closeForm();
      await load();
      setSelectedDate(eventDate);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("calendar.errorSave"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteConfirmed() {
    if (!token || !confirmDelete || !confirmDelete.editable) return;
    setSubmitting(true);
    setError(null);
    try {
      await calendarApi.remove(
        token,
        confirmDelete.seriesId ?? confirmDelete.id.split(":")[0] ?? confirmDelete.id,
      );
      setConfirmDelete(null);
      setDetailEvent(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("calendar.errorDelete"));
    } finally {
      setSubmitting(false);
    }
  }

  function eventTimeLabel(ev: PublicCalendarEvent): string {
    const end = eventEndKey(ev);
    if (end !== ev.date) {
      return `${ev.date.slice(5).replace("-", "/")} ~ ${end.slice(5).replace("-", "/")}`;
    }
    if (ev.time) {
      if (ev.endTime && ev.endTime !== ev.time) return `${ev.time} ~ ${ev.endTime}`;
      return ev.time;
    }
    return t("calendar.allDay");
  }

  return (
    <div>
      <TopBar
        title={t("calendar.title")}
        subtitle={t("calendar.subtitle")}
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
                      onOpenEvent={(ev, dayKey) => openDetail(ev, dayKey)}
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
            {selectedEvents.map((ev) => {
              const canManage = Boolean(ev.editable && user?.id === ev.userId);
              return (
                <SwipeableRow
                  key={ev.id}
                  canDelete={canManage}
                  deleteLabel={t("calendar.deleteEvent")}
                  actionOpen={swipeId === ev.id}
                  onActionOpenChange={(open) => setSwipeId(open ? ev.id : null)}
                  onPress={() => openDetail(ev)}
                  onLongPress={() => openDetail(ev)}
                  onDelete={() => {
                    setSwipeId(null);
                    setConfirmDelete(ev);
                  }}
                >
                  <div className="flex items-start gap-3 px-4 py-3">
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: categoryColor[ev.category] }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-neutral-800">{ev.title}</p>
                      <p className="text-[11px] text-neutral-400">
                        {eventTimeLabel(ev)} · {t(`category.${ev.category}`)}
                        {ev.isShared ? ` · ${ev.ownerName}` : ""}
                        {ev.reminderMinutesBefore != null
                          ? ` · ${reminderLabel(ev.reminderMinutesBefore, t)}`
                          : ""}
                      </p>
                      {ev.recurrence ? (
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-indigo-500">
                          <Repeat size={11} />
                          {formatRecurrenceLabel(ev.recurrence, ev.date, t, weekdays)}
                        </p>
                      ) : null}
                    </div>
                    {(ev.category === "document_expiry" ||
                      ev.category === "subscription_billing" ||
                      ev.category === "recurring_deposit" ||
                      ev.reminderMinutesBefore != null) && (
                      <Bell
                        size={14}
                        className={
                          ev.category === "document_expiry" ||
                          ev.category === "subscription_billing" ||
                          ev.category === "recurring_deposit"
                            ? "text-rose-400"
                            : "text-amber-500"
                        }
                      />
                    )}
                  </div>
                </SwipeableRow>
              );
            })}
            {selectedEvents.length > 0 && (
              <p className="text-center text-[11px] text-neutral-400">{t("common.rowHint")}</p>
            )}
          </div>
        </section>
      </div>

      {detailEvent && (
        <ItemDetailSheet
          title={detailEvent.title}
          onClose={() => setDetailEvent(null)}
          closeLabel={t("calendar.cancelAction")}
          editLabel={t("calendar.editEvent")}
          deleteLabel={t("calendar.deleteEvent")}
          canManage={Boolean(detailEvent.editable && user?.id === detailEvent.userId)}
          onEdit={() => openEdit(detailEvent)}
          onDelete={() => {
            setConfirmDelete(detailEvent);
            setDetailEvent(null);
          }}
        >
          <DetailRow label={t("calendar.fieldDateFrom")}>{eventTimeLabel(detailEvent)}</DetailRow>
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
        <OverlayScrim
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center"
          onDismiss={closeForm}
          label={t("calendar.cancelAction")}
        >
          <form
            ref={formScrollRef}
            onSubmit={(e) => void handleSaveEvent(e)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const tag = (e.target as HTMLElement).tagName;
              // Allow newline in memo; block Enter from submitting the form elsewhere.
              if (tag === "TEXTAREA") return;
              e.preventDefault();
            }}
            className="relative max-h-[var(--sheet-max-height,90vh)] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
            style={{ overflowAnchor: "none" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">
                {editingEvent ? t("calendar.editEvent") : t("calendar.addEvent")}
              </h2>
              <button type="button" onClick={closeForm} className="rounded-full p-2">
                <X size={18} className="text-neutral-400" />
              </button>
            </div>
            <label className="mb-1 block text-sm font-semibold text-neutral-700">{t("calendar.fieldTitle")}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mb-3 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
            />
            <div className="mb-3">
              <label className="mb-1 block text-sm font-semibold text-neutral-700">{t("calendar.fieldDateFrom")}</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => {
                    const next = e.target.value;
                    setEventDate(next);
                    if (eventEndDate && next > eventEndDate) setEventEndDate(next);
                    setRepeatDraft((prev) => ({
                      ...prev,
                      until: prev.until && prev.until < next ? next : prev.until,
                      weekdays:
                        (prev.preset === "weekly" || (prev.preset === "custom" && prev.freq === "WEEKLY")) &&
                        prev.weekdays.length <= 1
                          ? [weekdayFromKey(next)]
                          : prev.weekdays,
                    }));
                  }}
                  className="min-w-0 flex-1 basis-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
                <input
                  type="time"
                  value={eventTime}
                  onChange={(e) => {
                    const next = e.target.value;
                    setEventTime(next);
                    if (!next) {
                      setEventEndTime("");
                      return;
                    }
                    const plus = addOneHour(eventDate || todayKey(), next);
                    setEventEndDate(plus.date);
                    setEventEndTime(plus.time);
                  }}
                  className="min-w-0 flex-1 basis-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
              </div>
            </div>
            <div className="mb-3">
              <label className="mb-1 block text-sm font-semibold text-neutral-700">{t("calendar.fieldDateTo")}</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={eventEndDate}
                  onChange={(e) => {
                    const next = e.target.value;
                    setEventEndDate(next);
                    if (eventDate && next && next < eventDate) setEventDate(next);
                  }}
                  className="min-w-0 flex-1 basis-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
                <input
                  type="time"
                  value={eventEndTime}
                  onChange={(e) => setEventEndTime(e.target.value)}
                  className="min-w-0 flex-1 basis-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
              </div>
            </div>
            <p className="mb-3 text-[11px] text-neutral-400">{t("calendar.timeOptionalHint")}</p>
            <label className="mb-1 block text-sm font-semibold text-neutral-700">{t("calendar.reminder")}</label>
            <div className="mb-2 flex flex-wrap gap-2">
              {REMINDER_CHOICES.map((mins) => (
                <button
                  key={mins ?? "none"}
                  type="button"
                  onClick={() => setReminderMinutes(mins)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    reminderMinutes === mins ? "bg-indigo-600 text-white" : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {reminderLabel(mins, t)}
                </button>
              ))}
            </div>
            <p className="mb-3 text-[11px] text-neutral-400">
              {reminderFireHint(eventDate, eventTime, reminderMinutes, t) ?? t("calendar.reminderHint")}
            </p>
            <RecurrencePicker
              startDate={eventDate}
              draft={repeatDraft}
              onChange={(next) => {
                setRepeatDraft(next);
                if (next.preset !== "none" && !eventTime && !eventEndTime) {
                  setEventEndDate(eventDate);
                }
              }}
              t={t}
            />
            <label className="mb-1 block text-sm font-semibold text-neutral-700">{t("calendar.fieldMemo")}</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder={t("calendar.placeholderMemo")}
              rows={3}
              maxLength={2000}
              className="mb-3 w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
            />
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
            {formError ? (
              <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">{formError}</p>
            ) : null}
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {t("calendar.save")}
            </button>
          </form>
        </OverlayScrim>
      )}

      {confirmDelete && (
        <OverlayScrim
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onDismiss={() => setConfirmDelete(null)}
          label={t("calendar.cancelAction")}
          swipeToDismiss={false}
        >
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-bold text-neutral-900">{t("calendar.deleteEvent")}</h2>
            <p className="mt-2 text-sm text-neutral-500">
              {t("calendar.deleteConfirm", { name: confirmDelete.title })}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-600"
              >
                {t("calendar.cancelAction")}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleDeleteConfirmed()}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
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
