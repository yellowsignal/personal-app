import { useMemo, useState } from "react";
import { Bell, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import TopBar from "../components/TopBar";
import { calendarEvents, categoryColor, type CalendarEvent } from "../mocks/data";
import { useLanguage } from "../i18n/LanguageContext";

const TODAY = "2026-08-11";

type Category = CalendarEvent["category"];
const ALL_CATEGORIES: Category[] = ["personal", "family", "holiday", "document_expiry"];

function toKey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
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
  const { lang, t } = useLanguage();
  const weekdays = t("calendar.weekdays").split(",");
  const [cursor, setCursor] = useState({ year: 2026, month: 7 }); // 0-indexed: 7 = August
  const [activeCats, setActiveCats] = useState<Set<Category>>(new Set(ALL_CATEGORIES));
  const [selectedDate, setSelectedDate] = useState(TODAY);

  const cells = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);

  const filteredEvents = calendarEvents.filter((e) => activeCats.has(e.category));

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of filteredEvents) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return map;
  }, [filteredEvents]);

  const selectedEvents = (eventsByDate.get(selectedDate) ?? []).sort((a, b) =>
    (a.time ?? "").localeCompare(b.time ?? ""),
  );

  function toggleCategory(cat: Category) {
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

  return (
    <div>
      <TopBar
        title={t("calendar.title")}
        subtitle={t("calendar.subtitle")}
        right={
          <button className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white">
            <Plus size={18} />
          </button>
        }
      />

      <div className="mx-auto max-w-md px-4 pt-4">
        <div className="flex flex-wrap gap-2">
          {ALL_CATEGORIES.map((cat) => {
            const active = activeCats.has(cat);
            return (
              <button
                key={cat}
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

        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <div className="flex items-center justify-between">
            <button onClick={() => changeMonth(-1)} className="p-1 text-neutral-400">
              <ChevronLeft size={18} />
            </button>
            <p className="text-sm font-bold text-neutral-900">
              {t("calendar.monthYear", { year: cursor.year, month: cursor.month + 1 })}
            </p>
            <button onClick={() => changeMonth(1)} className="p-1 text-neutral-400">
              <ChevronRight size={18} />
            </button>
          </div>

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
              const isToday = key === TODAY;
              const isSelected = key === selectedDate;
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDate(key)}
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
                    {dayEvents.slice(0, 3).map((e) => (
                      <span
                        key={e.id}
                        className="h-1 w-1 rounded-full"
                        style={{ backgroundColor: categoryColor[e.category] }}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <section className="mt-4">
          <h2 className="px-1 text-sm font-bold text-neutral-900">{t("calendar.scheduleFor", { date: selectedDate })}</h2>
          <div className="mt-2 flex flex-col gap-2">
            {selectedEvents.length === 0 && (
              <p className="rounded-2xl bg-white px-4 py-6 text-center text-xs text-neutral-300 shadow-sm ring-1 ring-black/5">
                {t("calendar.noEvents")}
              </p>
            )}
            {selectedEvents.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/5"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: categoryColor[e.category] }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-neutral-800">{e.title[lang]}</p>
                  <p className="text-[11px] text-neutral-400">
                    {e.time ?? t("calendar.allDay")} · {t(`category.${e.category}`)}
                  </p>
                </div>
                {e.category === "document_expiry" && <Bell size={14} className="text-rose-400" />}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
