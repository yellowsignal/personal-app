/** 노조 달력(글꼴 ToUnicode 없음) — 빨간 동그라미 위치로 휴일을 복원한다. */

export interface CircleMark {
  cx: number;
  cy: number;
}

function ymd(year: number, month: number, day: number): string | null {
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return dt.toISOString().slice(0, 10);
}

function cluster(values: number[], tol: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    if (out.length === 0 || v - out[out.length - 1]! > tol) out.push(v);
  }
  return out;
}

function splitLeftRight(circles: CircleMark[]): { left: CircleMark[]; right: CircleMark[] } | null {
  const xs = cluster(
    circles.map((c) => c.cx),
    8,
  );
  if (xs.length < 8) return null;
  let gapAt = 0;
  let gap = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    const d = xs[i + 1]! - xs[i]!;
    if (d > gap) {
      gap = d;
      gapAt = i;
    }
  }
  if (gap < 40) return null;
  const split = (xs[gapAt]! + xs[gapAt + 1]!) / 2;
  return {
    left: circles.filter((c) => c.cx < split),
    right: circles.filter((c) => c.cx >= split),
  };
}

function monthRows(items: CircleMark[]): CircleMark[][][] | null {
  const sorted = [...items].sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  const weeks: CircleMark[][] = [];
  for (const c of sorted) {
    const last = weeks[weeks.length - 1];
    if (!last || Math.abs(c.cy - last[0]!.cy) > 8) weeks.push([c]);
    else last.push(c);
  }
  const months: CircleMark[][][] = [];
  for (const week of weeks) {
    const prev = months[months.length - 1];
    const prevY = prev?.[prev.length - 1]?.[0]?.cy;
    if (!prev || prevY == null || week[0]!.cy - prevY > 18) months.push([week]);
    else prev.push(week);
  }
  return months.length === 6 ? months : null;
}

function datesInColumn(items: CircleMark[], months: number[], fiscalYear: number): string[] {
  const groups = monthRows(items);
  if (!groups) return [];
  const xs = cluster(
    items.map((c) => c.cx),
    8,
  );
  if (xs.length < 2) return [];
  const x0 = xs[0]!;
  const x1 = xs[xs.length - 1]!;
  const cols = Array.from({ length: 7 }, (_, i) => x0 + ((x1 - x0) * i) / 6);
  const colIndex = (x: number) =>
    cols.reduce((best, _, i) => (Math.abs(cols[i]! - x) < Math.abs(cols[best]! - x) ? i : best), 0);

  const off: string[] = [];
  for (let mi = 0; mi < groups.length; mi++) {
    const month = months[mi]!;
    const year = month >= 4 ? fiscalYear : fiscalYear + 1;
    const first = new Date(Date.UTC(year, month - 1, 1));
    const sundayOffset = first.getUTCDay();
    const sun0 = Date.UTC(year, month - 1, 1 - sundayOffset);
    for (let wi = 0; wi < groups[mi]!.length; wi++) {
      for (const mark of groups[mi]![wi]!) {
        const dayMs = sun0 + (wi * 7 + colIndex(mark.cx)) * 86_400_000;
        const d = new Date(dayMs);
        const key = ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
        if (key && d.getUTCMonth() + 1 === month && d.getUTCFullYear() === year) off.push(key);
      }
    }
  }
  return off;
}

function addFiscalWeekends(off: Set<string>, fiscalYear: number): void {
  const start = Date.UTC(fiscalYear, 3, 1);
  const end = Date.UTC(fiscalYear + 1, 2, 31);
  for (let t = start; t <= end; t += 86_400_000) {
    const dt = new Date(t);
    const day = dt.getUTCDay();
    if (day === 0 || day === 6) off.add(dt.toISOString().slice(0, 10));
  }
}

/**
 * 2열×6개월(4월~3월), 일요일이 첫 칸인 노조 달력.
 * 빨간 동그라미 + 토/일은 휴일. 글자가 깨져도 좌표만 있으면 된다.
 */
export function offDatesFromCircledGrid(
  circles: CircleMark[],
  fiscalYear: number,
  pageHeight: number,
): string[] {
  const marks = circles.filter((c) => c.cy < pageHeight - 120);
  if (marks.length < 80) return [];
  const split = splitLeftRight(marks);
  if (!split) return [];
  const off = new Set<string>([
    ...datesInColumn(split.left, [4, 5, 6, 7, 8, 9], fiscalYear),
    ...datesInColumn(split.right, [10, 11, 12, 1, 2, 3], fiscalYear),
  ]);
  if (off.size < 20) return [];
  addFiscalWeekends(off, fiscalYear);
  return [...off].sort();
}
