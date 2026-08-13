import type { RecurrenceFreq, RecurrenceMonthMode, RecurrenceRule } from "../api/calendar";

export type RepeatPreset = "none" | "daily" | "weekdays" | "weekly" | "monthly" | "yearly" | "custom";
export type RepeatEnd = "never" | "until" | "count";

export interface RecurrenceDraft {
  preset: RepeatPreset;
  freq: RecurrenceFreq;
  interval: number;
  weekdays: number[];
  monthMode: RecurrenceMonthMode;
  /** 1–4 or -1 (last). Multiple = e.g. 1st + 3rd Wednesday. */
  bySetPosList: number[];
  end: RepeatEnd;
  until: string;
  count: number;
}

const PRESETS: RepeatPreset[] = ["none", "daily", "weekdays", "weekly", "monthly", "yearly", "custom"];
const FREQS: RecurrenceFreq[] = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];
const ENDS: RepeatEnd[] = ["never", "until", "count"];
const NTH_OPTIONS = [1, 2, 3, 4, -1] as const;

export function weekdayFromKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

function utcFromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
}

export function inferBySetPos(key: string): number {
  const date = utcFromKey(key);
  const weekday = date.getUTCDay();
  const nth = Math.ceil(date.getUTCDate() / 7);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  const back = (last.getUTCDay() - weekday + 7) % 7;
  last.setUTCDate(last.getUTCDate() - back);
  if (last.getTime() === date.getTime()) return -1;
  return Math.min(Math.max(nth, 1), 4);
}

function normalizeBySetPosList(value: number | number[] | undefined, fallback: number): number[] {
  const raw = Array.isArray(value) ? value : value != null ? [value] : [fallback];
  const allowed = new Set([-1, 1, 2, 3, 4]);
  const out = [...new Set(raw.filter((n) => allowed.has(n)))];
  return out.length ? out.sort((a, b) => (a === -1 ? 1 : b === -1 ? -1 : a - b)) : [fallback];
}

export function emptyRecurrenceDraft(startDate: string): RecurrenceDraft {
  return {
    preset: "none",
    freq: "WEEKLY",
    interval: 1,
    weekdays: [weekdayFromKey(startDate)],
    monthMode: "BY_MONTHDAY",
    bySetPosList: [inferBySetPos(startDate)],
    end: "never",
    until: startDate,
    count: 10,
  };
}

export function draftFromRecurrence(
  rule: RecurrenceRule | null | undefined,
  startDate: string,
): RecurrenceDraft {
  const base = emptyRecurrenceDraft(startDate);
  if (!rule) return base;
  const interval = Math.min(99, Math.max(1, Math.floor(rule.interval) || 1));
  const weekdays = rule.byWeekday?.length ? [...rule.byWeekday].sort((a, b) => a - b) : [weekdayFromKey(startDate)];
  const monthMode = rule.monthMode ?? "BY_MONTHDAY";
  const end: RepeatEnd = rule.until ? "until" : rule.count != null ? "count" : "never";
  let preset: RepeatPreset = "custom";
  if (interval === 1) {
    if (rule.freq === "DAILY" && !rule.byWeekday?.length) preset = "daily";
    else if (
      rule.freq === "WEEKLY" &&
      weekdays.length === 5 &&
      [1, 2, 3, 4, 5].every((d) => weekdays.includes(d))
    ) {
      preset = "weekdays";
    } else if (rule.freq === "WEEKLY") preset = "weekly";
    else if (rule.freq === "MONTHLY") preset = "monthly";
    else if (rule.freq === "YEARLY") preset = "yearly";
  }
  return {
    preset,
    freq: rule.freq,
    interval,
    weekdays,
    monthMode,
    bySetPosList: normalizeBySetPosList(rule.bySetPos, inferBySetPos(startDate)),
    end,
    until: rule.until ?? startDate,
    count: rule.count ?? 10,
  };
}

export function recurrenceFromDraft(draft: RecurrenceDraft, startDate: string): RecurrenceRule | null {
  if (draft.preset === "none") return null;
  const startWeekday = weekdayFromKey(startDate);
  let freq: RecurrenceFreq = "DAILY";
  let interval = 1;
  let byWeekday: number[] | undefined;
  let monthMode: RecurrenceMonthMode | undefined;
  let bySetPos: number | number[] | undefined;

  if (draft.preset === "daily") {
    freq = "DAILY";
  } else if (draft.preset === "weekdays") {
    freq = "WEEKLY";
    byWeekday = [1, 2, 3, 4, 5];
  } else if (draft.preset === "weekly") {
    freq = "WEEKLY";
    byWeekday = draft.weekdays.length ? [...draft.weekdays].sort((a, b) => a - b) : [startWeekday];
  } else if (draft.preset === "monthly") {
    freq = "MONTHLY";
    monthMode = draft.monthMode;
  } else if (draft.preset === "yearly") {
    freq = "YEARLY";
  } else {
    freq = draft.freq;
    interval = Math.min(99, Math.max(1, Math.floor(draft.interval) || 1));
    if (freq === "WEEKLY") {
      byWeekday = draft.weekdays.length ? [...draft.weekdays].sort((a, b) => a - b) : [startWeekday];
    }
    if (freq === "MONTHLY") monthMode = draft.monthMode;
  }

  if (freq === "MONTHLY" && monthMode === "BY_NTH_WEEKDAY") {
    byWeekday = draft.weekdays.length
      ? [...new Set(draft.weekdays)].sort((a, b) => a - b).slice(0, 1)
      : [startWeekday];
    const list = normalizeBySetPosList(draft.bySetPosList, inferBySetPos(startDate));
    bySetPos = list.length === 1 ? list[0]! : list;
  }

  const rule: RecurrenceRule = { freq, interval };
  if (byWeekday?.length) rule.byWeekday = byWeekday;
  if (monthMode) rule.monthMode = monthMode;
  if (bySetPos != null) rule.bySetPos = bySetPos;
  if (draft.end === "until" && /^\d{4}-\d{2}-\d{2}$/.test(draft.until)) {
    rule.until = draft.until < startDate ? startDate : draft.until;
  }
  if (draft.end === "count") {
    rule.count = Math.min(999, Math.max(1, Math.floor(draft.count) || 1));
  }
  return rule;
}

function nthKey(pos: number): string {
  if (pos === -1) return "calendar.repeatNthLast";
  if (pos === 1) return "calendar.repeatNth1";
  if (pos === 2) return "calendar.repeatNth2";
  if (pos === 3) return "calendar.repeatNth3";
  return "calendar.repeatNth4";
}

export function formatRecurrenceLabel(
  rule: RecurrenceRule | null | undefined,
  startDate: string,
  t: (key: string, params?: Record<string, string | number>) => string,
  weekdayNames: string[],
): string {
  if (!rule) return "";
  const n = rule.interval || 1;
  const days = (rule.byWeekday ?? [weekdayFromKey(startDate)])
    .map((d) => weekdayNames[d] ?? "")
    .filter(Boolean)
    .join(", ");
  const start = utcFromKey(startDate);
  const day = start.getUTCDate();
  const month = start.getUTCMonth() + 1;
  let core = "";
  if (rule.freq === "DAILY") {
    core = n === 1 ? t("calendar.repeatDaily") : t("calendar.repeatEveryDay", { n });
  } else if (rule.freq === "WEEKLY") {
    const isWeekdays =
      n === 1 &&
      (rule.byWeekday ?? []).length === 5 &&
      [1, 2, 3, 4, 5].every((d) => rule.byWeekday?.includes(d));
    if (isWeekdays) core = t("calendar.repeatWeekdays");
    else core = n === 1 ? t("calendar.repeatSummaryWeekly", { days }) : t("calendar.repeatEveryWeek", { n, days });
  } else if (rule.freq === "MONTHLY") {
    if (rule.monthMode === "BY_NTH_WEEKDAY") {
      const positions = normalizeBySetPosList(rule.bySetPos, inferBySetPos(startDate));
      const nthLabel = positions.map((pos) => t(nthKey(pos))).join("·");
      const weekday = weekdayNames[rule.byWeekday?.[0] ?? weekdayFromKey(startDate)] ?? "";
      core =
        n === 1
          ? t("calendar.repeatSummaryMonthlyWeekday", { nth: nthLabel, weekday })
          : t("calendar.repeatEveryMonthWeekday", { n, nth: nthLabel, weekday });
    } else {
      core = n === 1 ? t("calendar.repeatSummaryMonthlyDate", { day }) : t("calendar.repeatEveryMonthDate", { n, day });
    }
  } else {
    core = n === 1 ? t("calendar.repeatSummaryYearly", { month, day }) : t("calendar.repeatEveryYear", { n, month, day });
  }
  if (rule.until) core += ` · ${t("calendar.repeatSummaryUntil", { date: rule.until })}`;
  if (rule.count) core += ` · ${t("calendar.repeatSummaryCount", { count: rule.count })}`;
  return core;
}

function chipClass(active: boolean): string {
  return `rounded-full px-3 py-1.5 text-xs font-semibold ${
    active ? "bg-indigo-600 text-white" : "bg-neutral-100 text-neutral-600"
  }`;
}

export default function RecurrencePicker({
  startDate,
  draft,
  onChange,
  t,
}: {
  startDate: string;
  draft: RecurrenceDraft;
  onChange: (next: RecurrenceDraft) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const weekdayNames = t("calendar.weekdays").split(",");
  const showWeekdays = draft.preset === "weekly" || (draft.preset === "custom" && draft.freq === "WEEKLY");
  const showMonthMode = draft.preset === "monthly" || (draft.preset === "custom" && draft.freq === "MONTHLY");
  const showCustom = draft.preset === "custom";
  const startDay = Number(startDate.slice(8, 10)) || 1;
  const nth = inferBySetPos(startDate);
  const startWeekdayName = weekdayNames[weekdayFromKey(startDate)] ?? "";
  const preview = formatRecurrenceLabel(recurrenceFromDraft(draft, startDate), startDate, t, weekdayNames);

  function setPreset(preset: RepeatPreset) {
    onChange({
      ...draft,
      preset,
      freq:
        preset === "daily"
          ? "DAILY"
          : preset === "yearly"
            ? "YEARLY"
            : preset === "monthly"
              ? "MONTHLY"
              : "WEEKLY",
      interval: 1,
      weekdays: preset === "weekdays" ? [1, 2, 3, 4, 5] : [weekdayFromKey(startDate)],
    });
  }

  function toggleWeekday(day: number) {
    const has = draft.weekdays.includes(day);
    const next = has ? draft.weekdays.filter((d) => d !== day) : [...draft.weekdays, day];
    onChange({ ...draft, weekdays: next.length ? next : [day] });
  }

  const unitKey =
    draft.freq === "DAILY"
      ? "calendar.repeatUnitDay"
      : draft.freq === "WEEKLY"
        ? "calendar.repeatUnitWeek"
        : draft.freq === "MONTHLY"
          ? "calendar.repeatUnitMonth"
          : "calendar.repeatUnitYear";

  return (
    <div className="mb-3">
      <label className="mb-1 block text-sm font-semibold text-neutral-700">{t("calendar.repeat")}</label>
      <div className="mb-2 flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setPreset(preset)}
            className={chipClass(draft.preset === preset)}
          >
            {t(`calendar.repeatPreset.${preset}`)}
          </button>
        ))}
      </div>

      {draft.preset !== "none" && (
        <p className="mb-2 text-[11px] text-neutral-400">{t("calendar.repeatDurationHint")}</p>
      )}

      {showCustom && (
        <div className="mb-2 rounded-xl bg-neutral-50 p-3">
          <p className="mb-2 text-[11px] font-semibold text-neutral-500">{t("calendar.repeatCustomHint")}</p>
          <div className="mb-2 flex flex-wrap gap-2">
            {FREQS.map((freq) => (
              <button
                key={freq}
                type="button"
                onClick={() =>
                  onChange({
                    ...draft,
                    freq,
                    weekdays: freq === "WEEKLY" ? draft.weekdays : [weekdayFromKey(startDate)],
                  })
                }
                className={chipClass(draft.freq === freq)}
              >
                {t(`calendar.repeatFreq.${freq}`)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm text-neutral-700">
            <span className="shrink-0 text-neutral-500">{t("calendar.repeatIntervalLabel")}</span>
            <button
              type="button"
              onClick={() => onChange({ ...draft, interval: Math.max(1, draft.interval - 1) })}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg font-semibold text-neutral-600 ring-1 ring-neutral-200"
              aria-label="-1"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              max={99}
              value={draft.interval}
              onChange={(e) =>
                onChange({ ...draft, interval: Math.min(99, Math.max(1, Number(e.target.value) || 1)) })
              }
              className="h-8 w-14 rounded-lg border border-neutral-200 bg-white text-center text-sm outline-none focus:border-indigo-400"
            />
            <button
              type="button"
              onClick={() => onChange({ ...draft, interval: Math.min(99, draft.interval + 1) })}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg font-semibold text-neutral-600 ring-1 ring-neutral-200"
              aria-label="+1"
            >
              +
            </button>
            <span>{t(unitKey)}</span>
          </div>
        </div>
      )}

      {showWeekdays && (
        <div className="mb-2">
          <p className="mb-1 text-[11px] font-semibold text-neutral-500">{t("calendar.repeatPickWeekdays")}</p>
          <div className="flex flex-wrap gap-1.5">
            {weekdayNames.map((label, day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleWeekday(day)}
                className={`h-8 w-8 rounded-full text-xs font-semibold ${
                  draft.weekdays.includes(day)
                    ? "bg-indigo-600 text-white"
                    : "bg-neutral-100 text-neutral-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {showMonthMode && (
        <div className="mb-2 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => onChange({ ...draft, monthMode: "BY_MONTHDAY" })}
            className={`rounded-xl px-3 py-2 text-left text-sm ${
              draft.monthMode === "BY_MONTHDAY"
                ? "bg-indigo-50 font-semibold text-indigo-700 ring-1 ring-indigo-200"
                : "bg-neutral-50 text-neutral-600"
            }`}
          >
            {t("calendar.repeatMonthByDate", { day: startDay })}
          </button>
          <button
            type="button"
            onClick={() =>
              onChange({
                ...draft,
                monthMode: "BY_NTH_WEEKDAY",
                bySetPosList: draft.bySetPosList.length ? draft.bySetPosList : [nth],
                weekdays: draft.weekdays.length ? [draft.weekdays[0]!] : [weekdayFromKey(startDate)],
              })
            }
            className={`rounded-xl px-3 py-2 text-left text-sm ${
              draft.monthMode === "BY_NTH_WEEKDAY"
                ? "bg-indigo-50 font-semibold text-indigo-700 ring-1 ring-indigo-200"
                : "bg-neutral-50 text-neutral-600"
            }`}
          >
            {t("calendar.repeatMonthByWeekday", {
              nth: (draft.monthMode === "BY_NTH_WEEKDAY" && draft.bySetPosList.length
                ? draft.bySetPosList
                : [nth]
              )
                .map((pos) => t(nthKey(pos)))
                .join("·"),
              weekday:
                weekdayNames[
                  draft.monthMode === "BY_NTH_WEEKDAY" && draft.weekdays[0] != null
                    ? draft.weekdays[0]
                    : weekdayFromKey(startDate)
                ] ?? startWeekdayName,
            })}
          </button>
          {draft.monthMode === "BY_NTH_WEEKDAY" && (
            <>
              <p className="mt-1 text-[11px] font-semibold text-neutral-500">{t("calendar.repeatPickNthMulti")}</p>
              <div className="flex flex-wrap gap-1.5">
                {NTH_OPTIONS.map((pos) => {
                  const selected = draft.bySetPosList.includes(pos);
                  return (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => {
                        const next = selected
                          ? draft.bySetPosList.filter((p) => p !== pos)
                          : [...draft.bySetPosList, pos].sort((a, b) =>
                              a === -1 ? 1 : b === -1 ? -1 : a - b,
                            );
                        onChange({
                          ...draft,
                          bySetPosList: next.length ? next : [nth],
                        });
                      }}
                      className={chipClass(selected)}
                    >
                      {t(nthKey(pos))}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] font-semibold text-neutral-500">{t("calendar.repeatPickWeekday")}</p>
              <div className="flex flex-wrap gap-1.5">
                {weekdayNames.map((label, day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => onChange({ ...draft, weekdays: [day] })}
                    className={`h-8 w-8 rounded-full text-xs font-semibold ${
                      draft.weekdays[0] === day
                        ? "bg-indigo-600 text-white"
                        : "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {draft.preset !== "none" && (
        <>
          <p className="mb-1 text-[11px] font-semibold text-neutral-500">{t("calendar.repeatEnd")}</p>
          <div className="mb-2 flex flex-wrap gap-2">
            {ENDS.map((end) => (
              <button key={end} type="button" onClick={() => onChange({ ...draft, end })} className={chipClass(draft.end === end)}>
                {t(`calendar.repeatEnd.${end}`)}
              </button>
            ))}
          </div>
          {draft.end === "until" && (
            <input
              type="date"
              value={draft.until}
              min={startDate}
              onChange={(e) => onChange({ ...draft, until: e.target.value })}
              className="mb-2 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
            />
          )}
          {draft.end === "count" && (
            <div className="mb-2 flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="number"
                min={1}
                max={999}
                value={draft.count}
                onChange={(e) =>
                  onChange({ ...draft, count: Math.min(999, Math.max(1, Number(e.target.value) || 1)) })
                }
                className="h-9 w-20 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm outline-none focus:border-indigo-400"
              />
              <span>{t("calendar.repeatCountUnit")}</span>
            </div>
          )}
          {preview ? <p className="text-[11px] text-indigo-600">{preview}</p> : null}
        </>
      )}
    </div>
  );
}
