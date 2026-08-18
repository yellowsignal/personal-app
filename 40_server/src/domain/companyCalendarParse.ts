import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface ParsedCompanyCalendar {
  fiscalYear: number;
  offDates: string[];
}

type FillName = "yellow" | "green" | "gray" | "other";

interface FillRect {
  name: FillName;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface TextItem {
  str: string;
  x: number;
  y: number;
  cx: number;
  cy: number;
  fontH: number;
}

interface MonthHeader {
  month: number;
  x: number;
  y: number;
}

const OPS_NAME = new Map<number, string>(Object.entries(OPS).map(([k, v]) => [v as number, k]));

function classifyFill(r: number, g: number, b: number): FillName | "skip" {
  const rn = r > 1 ? r / 255 : r;
  const gn = g > 1 ? g / 255 : g;
  const bn = b > 1 ? b / 255 : b;
  if (rn > 0.97 && gn > 0.97 && bn > 0.97) return "skip";
  if (rn < 0.08 && gn < 0.08 && bn < 0.08) return "skip";
  if (rn > 0.8 && gn > 0.8 && bn < 0.35) return "yellow";
  if (gn > 0.7 && rn < 0.7 && bn < 0.55) return "green";
  if (Math.abs(rn - gn) < 0.08 && Math.abs(gn - bn) < 0.08 && rn > 0.45 && rn < 0.95) return "gray";
  return "other";
}

function ymd(year: number, month: number, day: number): string | null {
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;
  return dt.toISOString().slice(0, 10);
}

function detectYearHint(texts: TextItem[], fallback: number): number {
  for (const t of texts) {
    const m = t.str.match(/(20\d{2})\s*年/);
    if (m) return Number(m[1]);
  }
  for (const t of texts) {
    const m = t.str.match(/20\d{2}/);
    if (m) {
      const y = Number(m[0]);
      if (y >= 2020 && y <= 2040) return y;
    }
  }
  return fallback;
}

function detectMonthHeaders(nums: TextItem[]): MonthHeader[] {
  const candidates = nums.filter((n) => /^(1[0-2]|[1-9])$/.test(n.str) && n.fontH >= 12);
  const pool = candidates.length >= 12 ? candidates : nums.filter((n) => /^(1[0-2]|[1-9])$/.test(n.str));
  const bands = new Map<number, TextItem[]>();
  for (const n of pool) {
    const y = Math.round(n.y * 2) / 2;
    const list = bands.get(y) ?? [];
    list.push(n);
    bands.set(y, list);
  }
  const headers: MonthHeader[] = [];
  for (const [y, items] of [...bands.entries()].sort((a, b) => a[0] - b[0])) {
    const unique = [...items].sort((a, b) => a.x - b.x);
    if (unique.length !== 3) continue;
    const months = unique.map((t) => Number(t.str));
    if (new Set(months).size !== 3) continue;
    const dx1 = unique[1]!.x - unique[0]!.x;
    const dx2 = unique[2]!.x - unique[1]!.x;
    if (dx1 < 80 || dx1 > 220 || dx2 < 80 || dx2 > 220) continue;
    const ok =
      (months[0] === 4 && months[1] === 5 && months[2] === 6) ||
      (months[0] === 7 && months[1] === 8 && months[2] === 9) ||
      (months[0] === 10 && months[1] === 11 && months[2] === 12) ||
      (months[0] === 1 && months[1] === 2 && months[2] === 3);
    if (!ok) continue;
    for (const t of unique) {
      headers.push({ month: Number(t.str), x: t.x, y });
    }
  }
  return headers;
}

function cluster(values: number[], tol: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) {
    if (out.length === 0 || v - out[out.length - 1]! > tol) out.push(v);
  }
  return out;
}

function monthFor(headers: MonthHeader[], x: number, y: number): MonthHeader | null {
  if (headers.length === 0) return null;
  const xs = cluster(headers.map((h) => h.x), 20);
  const ys = cluster(headers.map((h) => h.y), 20);
  const colW = xs.length >= 2 ? xs[1]! - xs[0]! : 161;
  const rowH = ys.length >= 2 ? ys[1]! - ys[0]! : 88;
  for (const h of headers) {
    if (x >= h.x - 18 && x <= h.x + colW - 8 && y >= h.y - 6 && y <= h.y + rowH - 4) {
      return h;
    }
  }
  return null;
}

function isHeaderNumber(headers: MonthHeader[], item: TextItem): boolean {
  return headers.some(
    (h) => h.month === Number(item.str) && Math.abs(item.x - h.x) < 14 && Math.abs(item.y - h.y) < 8,
  );
}

function fillAt(fills: FillRect[], x: number, y: number): FillName | null {
  let best: FillRect | null = null;
  let bestArea = Infinity;
  for (const f of fills) {
    const w = f.x1 - f.x0;
    const h = f.y1 - f.y0;
    if (h < 5 || h > 28 || w < 6 || w > 90) continue;
    if (x >= f.x0 - 1 && x <= f.x1 + 1 && y >= f.y0 - 1 && y <= f.y1 + 1) {
      const area = w * h;
      if (area < bestArea) {
        best = f;
        bestArea = area;
      }
    }
  }
  return best?.name ?? null;
}

function akashiOff(name: FillName | null): boolean {
  return name === "gray" || name === "yellow";
}

async function extractPage(page: {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[] }>;
  getTextContent: () => Promise<{ items: Array<Record<string, unknown>> }>;
}): Promise<{ fills: FillRect[]; texts: TextItem[] }> {
  const viewport = page.getViewport({ scale: 1 });
  const height = viewport.height;
  const ops = await page.getOperatorList();
  let fillRgb: [number, number, number] | null = null;
  const fills: FillRect[] = [];

  for (let i = 0; i < ops.fnArray.length; i++) {
    const name = OPS_NAME.get(ops.fnArray[i]!) ?? "";
    const args = ops.argsArray[i];
    if (name === "setFillRGBColor" && args && typeof args === "object" && "length" in (args as object)) {
      const a = args as ArrayLike<number>;
      if (a.length >= 3) fillRgb = [Number(a[0]), Number(a[1]), Number(a[2])];
    } else if (name === "constructPath" && Array.isArray(args)) {
      const pathOps = args[0] as number[] | undefined;
      const coords = args[1] as number[] | undefined;
      if (!pathOps || !coords) continue;
      let ci = 0;
      for (const op of pathOps) {
        if (op === OPS.rectangle && coords.length >= ci + 4) {
          const x = coords[ci]!;
          const y = coords[ci + 1]!;
          const w = coords[ci + 2]!;
          const h = coords[ci + 3]!;
          ci += 4;
          if (!fillRgb) continue;
          const kind = classifyFill(fillRgb[0], fillRgb[1], fillRgb[2]);
          if (kind === "skip") continue;
          const x0 = x;
          const x1 = x + w;
          const y0Top = height - (y + h);
          const y1Top = height - y;
          fills.push({ name: kind, x0, y0: y0Top, x1, y1: y1Top });
        } else {
          ci += 2;
        }
      }
    }
  }

  const content = await page.getTextContent();
  const texts: TextItem[] = [];
  for (const raw of content.items) {
    const str = typeof raw.str === "string" ? raw.str.trim() : "";
    if (!str) continue;
    const transform = raw.transform as number[] | undefined;
    if (!transform || transform.length < 6) continue;
    const x = transform[4]!;
    const baseline = transform[5]!;
    const fontH = Math.abs(transform[3] ?? transform[0] ?? 10);
    const yTop = height - baseline - fontH * 0.15;
    const width = typeof raw.width === "number" ? raw.width : fontH;
    texts.push({
      str,
      x,
      y: yTop,
      cx: x + width / 2,
      cy: yTop + fontH / 3,
      fontH,
    });
  }
  return { fills, texts };
}

export async function parseCompanyCalendarPdf(
  bytes: Uint8Array,
  opts: { yearHint?: number } = {},
): Promise<ParsedCompanyCalendar> {
  const doc = await getDocument({
    data: bytes.slice(),
    useSystemFonts: true,
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;

  try {
    const yearHint = opts.yearHint ?? japanFiscalYearHint();
    const off = new Set<string>();
    let detectedYear = yearHint;

    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const { fills, texts } = await extractPage(page);
      detectedYear = detectYearHint(texts, detectedYear);
      const dayTexts = texts.filter((t) => /^(3[01]|[12]?\d)$/.test(t.str) && Number(t.str) >= 1);
      const headers = detectMonthHeaders(dayTexts);
      if (headers.length === 0) continue;

      const calendarFills = fills.filter((f) => f.y0 > headers[0]!.y - 20);
      for (const t of dayTexts) {
        const day = Number(t.str);
        if (day < 1 || day > 31) continue;
        if (isHeaderNumber(headers, t)) continue;
        const header = monthFor(headers, t.cx, t.cy);
        if (!header) continue;
        const fill = fillAt(calendarFills, t.cx, t.y + 2);
        if (!akashiOff(fill)) continue;
        const calendarYear = header.month >= 4 ? detectedYear : detectedYear + 1;
        const key = ymd(calendarYear, header.month, day);
        if (key) off.add(key);
      }
    }

    if (off.size < 20) {
      throw Object.assign(new Error("could not read enough company holidays from this PDF"), {
        code: "PARSE_FAILED",
      });
    }

    return { fiscalYear: detectedYear, offDates: [...off].sort() };
  } finally {
    await doc.destroy();
  }
}

function japanFiscalYearHint(): number {
  const now = new Date();
  const y = now.getUTCFullYear();
  return now.getUTCMonth() + 1 >= 4 ? y : y - 1;
}

export function isPdfMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}
