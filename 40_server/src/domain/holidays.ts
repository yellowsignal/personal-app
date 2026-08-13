import { parseDateKey, toDateKey } from "./calendarTypes.js";

export type HolidayCountry = "KR" | "JP";
export type HolidayPref = "KR" | "JP" | "BOTH";

export interface HolidayName {
  ko: string;
  ja: string;
}

export interface PublicHoliday {
  date: string;
  country: HolidayCountry;
  code: string;
  name: HolidayName;
}

const HOLIDAY_PREFS = new Set<string>(["KR", "JP", "BOTH"]);

export function parseHolidayPref(value: unknown, fallback: HolidayPref = "JP"): HolidayPref {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const v = value.trim().toUpperCase();
  return HOLIDAY_PREFS.has(v) ? (v as HolidayPref) : fallback;
}

export function holidayCountries(pref: HolidayPref): HolidayCountry[] {
  if (pref === "KR") return ["KR"];
  if (pref === "BOTH") return ["KR", "JP"];
  return ["JP"];
}

function addDays(key: string, n: number): string {
  const d = parseDateKey(key);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateKey(d);
}

function dow(key: string): number {
  return parseDateKey(key).getUTCDay();
}

function ymd(year: number, month1: number, day: number): string {
  return toDateKey(new Date(Date.UTC(year, month1 - 1, day)));
}

function nthWeekday(year: number, month1: number, weekday: number, n: number): number {
  const firstDow = new Date(Date.UTC(year, month1 - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - firstDow + 7) % 7) + (n - 1) * 7;
  return day;
}

function nextOpenDay(after: string, taken: Set<string>): string {
  let d = addDays(after, 1);
  while (dow(d) === 0 || dow(d) === 6 || taken.has(d)) {
    d = addDays(d, 1);
  }
  return d;
}

function nextNonHoliday(after: string, taken: Set<string>): string {
  let d = addDays(after, 1);
  while (taken.has(d)) d = addDays(d, 1);
  return d;
}

/** 설날 당일, 부처님오신날, 추석 당일 (KASI / Wikipedia). */
const KR_LUNAR: Record<number, readonly [string, string, string]> = {
  2020: ["2020-01-25", "2020-04-30", "2020-10-01"],
  2021: ["2021-02-12", "2021-05-19", "2021-09-21"],
  2022: ["2022-02-01", "2022-05-08", "2022-09-10"],
  2023: ["2023-01-22", "2023-05-27", "2023-09-29"],
  2024: ["2024-02-10", "2024-05-15", "2024-09-17"],
  2025: ["2025-01-29", "2025-05-05", "2025-10-06"],
  2026: ["2026-02-17", "2026-05-24", "2026-09-25"],
  2027: ["2027-02-07", "2027-05-13", "2027-09-15"],
  2028: ["2028-01-27", "2028-05-02", "2028-10-03"],
  2029: ["2029-02-13", "2029-05-20", "2029-09-22"],
  2030: ["2030-02-03", "2030-05-09", "2030-09-12"],
  2031: ["2031-01-23", "2031-05-28", "2031-10-01"],
  2032: ["2032-02-11", "2032-05-16", "2032-09-19"],
  2033: ["2033-01-31", "2033-05-06", "2033-09-08"],
  2034: ["2034-02-19", "2034-05-25", "2034-09-27"],
  2035: ["2035-02-08", "2035-05-15", "2035-09-16"],
  2036: ["2036-01-28", "2036-05-03", "2036-10-04"],
  2037: ["2037-02-15", "2037-05-22", "2037-09-24"],
  2038: ["2038-02-04", "2038-05-11", "2038-09-13"],
  2039: ["2039-01-24", "2039-04-30", "2039-10-02"],
  2040: ["2040-02-12", "2040-05-18", "2040-09-21"],
};

const N = {
  jpNewYear: { ko: "원단", ja: "元日" },
  comingOfAge: { ko: "성인의 날", ja: "成人の日" },
  foundation: { ko: "건국기념일", ja: "建国記念の日" },
  emperor: { ko: "천황탄생일", ja: "天皇誕生日" },
  vernal: { ko: "춘분의 날", ja: "春分の日" },
  showa: { ko: "쇼와의 날", ja: "昭和の日" },
  constitutionJp: { ko: "헌법기념일", ja: "憲法記念日" },
  greenery: { ko: "녹색의 날", ja: "みどりの日" },
  childrenJp: { ko: "어린이날", ja: "こどもの日" },
  marine: { ko: "바다의 날", ja: "海の日" },
  mountain: { ko: "산의 날", ja: "山の日" },
  respectAged: { ko: "경로의 날", ja: "敬老の日" },
  autumnal: { ko: "추분의 날", ja: "秋分の日" },
  sports: { ko: "스포츠의 날", ja: "スポーツの日" },
  culture: { ko: "문화의 날", ja: "文化の日" },
  laborThanks: { ko: "근로감사의 날", ja: "勤労感謝の日" },
  substituteJp: { ko: "대체휴일", ja: "振替休日" },
  citizensDay: { ko: "국민의 휴일", ja: "国民の休日" },
  krNewYear: { ko: "신정", ja: "元日（韓国）" },
  seollalEve: { ko: "설날 연휴", ja: "旧正月前日" },
  seollal: { ko: "설날", ja: "旧正月" },
  seollalNext: { ko: "설날 연휴", ja: "旧正月翌日" },
  independence: { ko: "삼일절", ja: "三一節" },
  laborKr: { ko: "노동절", ja: "労働節" },
  childrenKr: { ko: "어린이날", ja: "子供の日（韓国）" },
  buddha: { ko: "부처님오신날", ja: "釈迦誕生日" },
  memorial: { ko: "현충일", ja: "顕忠日" },
  constitutionKr: { ko: "제헌절", ja: "制憲節" },
  liberation: { ko: "광복절", ja: "光復節" },
  chuseokEve: { ko: "추석 연휴", ja: "秋夕前日" },
  chuseok: { ko: "추석", ja: "秋夕" },
  chuseokNext: { ko: "추석 연휴", ja: "秋夕翌日" },
  foundationKr: { ko: "개천절", ja: "開天節" },
  hangul: { ko: "한글날", ja: "ハングルの日" },
  christmas: { ko: "크리스마스", ja: "クリスマス" },
  substituteKr: { ko: "대체공휴일", ja: "代替公休日" },
} as const satisfies Record<string, HolidayName>;

interface MutableHoliday {
  date: string;
  country: HolidayCountry;
  code: string;
  name: HolidayName;
  group?: "seollal" | "chuseok";
  substituteEligible: boolean;
}

function jpEquinoxDay(year: number, kind: "vernal" | "autumnal"): number {
  const base = kind === "vernal" ? 20.8431 : 23.2488;
  const y = year - 1980;
  return Math.floor(base + 0.242194 * y - Math.floor(y / 4));
}

function japanBase(year: number): MutableHoliday[] {
  const out: MutableHoliday[] = [
    { date: ymd(year, 1, 1), country: "JP", code: "new-year", name: N.jpNewYear, substituteEligible: true },
    {
      date: ymd(year, 1, nthWeekday(year, 1, 1, 2)),
      country: "JP",
      code: "coming-of-age",
      name: N.comingOfAge,
      substituteEligible: true,
    },
    { date: ymd(year, 2, 11), country: "JP", code: "foundation", name: N.foundation, substituteEligible: true },
    { date: ymd(year, 2, 23), country: "JP", code: "emperor", name: N.emperor, substituteEligible: true },
    { date: ymd(year, 3, jpEquinoxDay(year, "vernal")), country: "JP", code: "vernal", name: N.vernal, substituteEligible: true },
    { date: ymd(year, 4, 29), country: "JP", code: "showa", name: N.showa, substituteEligible: true },
    { date: ymd(year, 5, 3), country: "JP", code: "constitution", name: N.constitutionJp, substituteEligible: true },
    { date: ymd(year, 5, 4), country: "JP", code: "greenery", name: N.greenery, substituteEligible: true },
    { date: ymd(year, 5, 5), country: "JP", code: "children", name: N.childrenJp, substituteEligible: true },
    {
      date: ymd(year, 7, nthWeekday(year, 7, 1, 3)),
      country: "JP",
      code: "marine",
      name: N.marine,
      substituteEligible: true,
    },
    { date: ymd(year, 8, 11), country: "JP", code: "mountain", name: N.mountain, substituteEligible: true },
    {
      date: ymd(year, 9, nthWeekday(year, 9, 1, 3)),
      country: "JP",
      code: "respect-aged",
      name: N.respectAged,
      substituteEligible: true,
    },
    { date: ymd(year, 9, jpEquinoxDay(year, "autumnal")), country: "JP", code: "autumnal", name: N.autumnal, substituteEligible: true },
    {
      date: ymd(year, 10, nthWeekday(year, 10, 1, 2)),
      country: "JP",
      code: "sports",
      name: N.sports,
      substituteEligible: true,
    },
    { date: ymd(year, 11, 3), country: "JP", code: "culture", name: N.culture, substituteEligible: true },
    { date: ymd(year, 11, 23), country: "JP", code: "labor-thanks", name: N.laborThanks, substituteEligible: true },
  ];
  return out;
}

function applyJapanSubstitutes(year: number, base: MutableHoliday[]): MutableHoliday[] {
  const taken = new Set(base.map((h) => h.date));
  const extra: MutableHoliday[] = [];
  const sorted = [...base].sort((a, b) => a.date.localeCompare(b.date));
  for (const h of sorted) {
    if (dow(h.date) !== 0) continue;
    const sub = nextNonHoliday(h.date, taken);
    taken.add(sub);
    extra.push({
      date: sub,
      country: "JP",
      code: `${h.code}-obs`,
      name: { ko: `${h.name.ko} 대체휴일`, ja: `${h.name.ja}の振替休日` },
      substituteEligible: false,
    });
  }

  const withSubs = [...base, ...extra];
  const all = new Set(withSubs.map((h) => h.date));
  const start = `${year}-01-02`;
  const end = `${year}-12-30`;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (all.has(d)) continue;
    if (!all.has(addDays(d, -1)) || !all.has(addDays(d, 1))) continue;
    all.add(d);
    withSubs.push({
      date: d,
      country: "JP",
      code: `citizens-${d}`,
      name: N.citizensDay,
      substituteEligible: false,
    });
  }
  return withSubs;
}

function koreaBase(year: number): MutableHoliday[] {
  const out: MutableHoliday[] = [
    { date: ymd(year, 1, 1), country: "KR", code: "new-year", name: N.krNewYear, substituteEligible: false },
    { date: ymd(year, 3, 1), country: "KR", code: "independence", name: N.independence, substituteEligible: true },
    { date: ymd(year, 5, 5), country: "KR", code: "children", name: N.childrenKr, substituteEligible: true },
    { date: ymd(year, 6, 6), country: "KR", code: "memorial", name: N.memorial, substituteEligible: false },
    { date: ymd(year, 8, 15), country: "KR", code: "liberation", name: N.liberation, substituteEligible: true },
    { date: ymd(year, 10, 3), country: "KR", code: "foundation", name: N.foundationKr, substituteEligible: true },
    { date: ymd(year, 10, 9), country: "KR", code: "hangul", name: N.hangul, substituteEligible: true },
    { date: ymd(year, 12, 25), country: "KR", code: "christmas", name: N.christmas, substituteEligible: true },
  ];
  if (year >= 2026) {
    out.push({ date: ymd(year, 5, 1), country: "KR", code: "labor", name: N.laborKr, substituteEligible: true });
    out.push({
      date: ymd(year, 7, 17),
      country: "KR",
      code: "constitution",
      name: N.constitutionKr,
      substituteEligible: true,
    });
  }

  const lunar = KR_LUNAR[year];
  if (lunar) {
    const [seollal, buddha, chuseok] = lunar;
    out.push(
      { date: addDays(seollal, -1), country: "KR", code: "seollal-eve", name: N.seollalEve, group: "seollal", substituteEligible: true },
      { date: seollal, country: "KR", code: "seollal", name: N.seollal, group: "seollal", substituteEligible: true },
      { date: addDays(seollal, 1), country: "KR", code: "seollal-next", name: N.seollalNext, group: "seollal", substituteEligible: true },
      { date: buddha, country: "KR", code: "buddha", name: N.buddha, substituteEligible: true },
      { date: addDays(chuseok, -1), country: "KR", code: "chuseok-eve", name: N.chuseokEve, group: "chuseok", substituteEligible: true },
      { date: chuseok, country: "KR", code: "chuseok", name: N.chuseok, group: "chuseok", substituteEligible: true },
      { date: addDays(chuseok, 1), country: "KR", code: "chuseok-next", name: N.chuseokNext, group: "chuseok", substituteEligible: true },
    );
  }
  return out;
}

function applyKoreaSubstitutes(base: MutableHoliday[]): MutableHoliday[] {
  const extra: MutableHoliday[] = [];
  const taken = new Set(base.map((h) => h.date));
  const byDate = new Map<string, MutableHoliday[]>();
  for (const h of base) {
    const list = byDate.get(h.date) ?? [];
    list.push(h);
    byDate.set(h.date, list);
  }

  const addSub = (after: string, source: MutableHoliday) => {
    const sub = nextOpenDay(after, taken);
    taken.add(sub);
    extra.push({
      date: sub,
      country: "KR",
      code: `${source.code}-obs`,
      name: { ko: `${source.name.ko} 대체공휴일`, ja: `${source.name.ja}の代替公休日` },
      substituteEligible: false,
    });
  };

  for (const group of ["seollal", "chuseok"] as const) {
    const days = base.filter((h) => h.group === group).sort((a, b) => a.date.localeCompare(b.date));
    if (days.length === 0) continue;
    const weekend = days.some((d) => dow(d.date) === 0 || dow(d.date) === 6);
    const stacked = days.some((d) => (byDate.get(d.date) ?? []).some((x) => x.group !== group));
    let n = 0;
    if (weekend) n += 1;
    if (stacked) n += 1;
    const last = days[days.length - 1]!;
    for (let i = 0; i < n; i++) addSub(last.date, last);
  }

  const lunarDates = new Set(base.filter((h) => h.group).map((h) => h.date));
  const seenSingle = new Set<string>();
  for (const h of base) {
    if (h.group || !h.substituteEligible) continue;
    if (lunarDates.has(h.date)) continue;
    if (seenSingle.has(h.date)) continue;
    seenSingle.add(h.date);
    const stacked = (byDate.get(h.date) ?? []).length > 1;
    const weekend = dow(h.date) === 0 || dow(h.date) === 6;
    if (weekend || stacked) addSub(h.date, h);
  }

  return [...base, ...extra];
}

function holidaysForYear(year: number, countries: HolidayCountry[]): PublicHoliday[] {
  const out: PublicHoliday[] = [];
  if (countries.includes("JP")) {
    for (const h of applyJapanSubstitutes(year, japanBase(year))) {
      out.push({ date: h.date, country: h.country, code: h.code, name: h.name });
    }
  }
  if (countries.includes("KR")) {
    for (const h of applyKoreaSubstitutes(koreaBase(year))) {
      out.push({ date: h.date, country: h.country, code: h.code, name: h.name });
    }
  }
  return out;
}

export function listPublicHolidays(
  fromKey: string,
  toKey: string,
  countries: HolidayCountry[],
): PublicHoliday[] {
  if (countries.length === 0) return [];
  const fromYear = Number(fromKey.slice(0, 4));
  const toYear = Number(toKey.slice(0, 4));
  const out: PublicHoliday[] = [];
  for (let y = fromYear - 1; y <= toYear + 1; y++) {
    if (y < 2020 || y > 2040) {
      // lunar table coverage; still emit JP (and KR solar) outside the table
      if (y < 1980 || y > 2099) continue;
    }
    for (const h of holidaysForYear(y, countries)) {
      if (h.date >= fromKey && h.date <= toKey) out.push(h);
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.country.localeCompare(b.country) || a.code.localeCompare(b.code));
  return out;
}

export function holidayTitle(h: PublicHoliday, lang: string): string {
  return lang === "ja" ? h.name.ja : h.name.ko;
}
