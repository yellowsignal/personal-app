import type { DepositBank } from "../domain/assetTypes.js";

export interface ParsedStatementRow {
  date: string;
  description: string;
  category: "credit" | "debit";
  amount: number;
  balanceAfter: number | null;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === "," || ch === "\t") {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (ch === "\n" || (ch === "\r" && next === "\n")) {
      row.push(cell.trim());
      cell = "";
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      if (ch === "\r") i++;
      continue;
    }
    if (ch === "\r") continue;
    cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[¥￥₩,\s"]/g, "").replace(/円/g, "");
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseDate(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;

  const iso = t.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (y >= 1990 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  const compact = t.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compact) {
    const y = Number(compact[1]);
    const m = Number(compact[2]);
    const d = Number(compact[3]);
    if (y >= 1990 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  const jp = t.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (jp) {
    const y = Number(jp[1]);
    const m = Number(jp[2]);
    const d = Number(jp[3]);
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  return null;
}

function findColumn(headers: string[], patterns: RegExp[]): number {
  const norm = headers.map((h) => h.replace(/\s/g, "").toLowerCase());
  for (let i = 0; i < norm.length; i++) {
    if (patterns.some((p) => p.test(norm[i]!))) return i;
  }
  return -1;
}

function looksLikeHeaderRow(headers: string[], bankCode: DepositBank): boolean {
  if (headers.filter((h) => h.trim()).length < 3) return false;
  const patterns = BANK_COLUMN_PATTERNS[bankCode];
  const dateCol = findColumn(headers, patterns.date);
  const creditCol = findColumn(headers, patterns.credit);
  const debitCol = findColumn(headers, patterns.debit);
  return dateCol >= 0 && (creditCol >= 0 || debitCol >= 0);
}

const BANK_COLUMN_PATTERNS: Record<
  DepositBank,
  {
    date: RegExp[];
    description: RegExp[];
    credit: RegExp[];
    debit: RegExp[];
    balance: RegExp[];
  }
> = {
  SHINHAN: {
    date: [/거래일자/, /거래일/, /일자/, /date/i],
    description: [/적요/, /내용/, /memo/i, /description/i],
    credit: [/입금액/, /입금/, /credit/i, /deposit/i],
    debit: [/출금액/, /출금/, /debit/i, /withdraw/i],
    balance: [/잔액/, /balance/i],
  },
  MUFG: {
    date: [/日付/, /年月日/, /date/i],
    description: [/摘要/, /内容/, /description/i, /memo/i],
    credit: [/お預入/, /預入/, /入金/, /credit/i, /deposit/i],
    debit: [/お引出/, /引出/, /出金/, /debit/i, /withdraw/i],
    balance: [/残高/, /balance/i],
  },
  YUCHO: {
    date: [/年月日/, /日付/, /date/i],
    description: [/摘要/, /内容/, /description/i],
    credit: [/お預入/, /預入/, /入金/, /credit/i],
    debit: [/お引出/, /引出/, /出金/, /debit/i],
    balance: [/残高/, /balance/i],
  },
};

function parseWithHeaders(
  bankCode: DepositBank,
  headers: string[],
  dataRows: string[][],
): ParsedStatementRow[] {
  const patterns = BANK_COLUMN_PATTERNS[bankCode];
  const dateCol = findColumn(headers, patterns.date);
  const descCol = findColumn(headers, patterns.description);
  const creditCol = findColumn(headers, patterns.credit);
  const debitCol = findColumn(headers, patterns.debit);
  const balanceCol = findColumn(headers, patterns.balance);

  if (dateCol < 0) return [];

  const rows: ParsedStatementRow[] = [];
  for (const line of dataRows) {
    const date = parseDate(line[dateCol] ?? "");
    if (!date) continue;

    const credit = creditCol >= 0 ? parseNumber(line[creditCol] ?? "") : null;
    const debit = debitCol >= 0 ? parseNumber(line[debitCol] ?? "") : null;
    const balanceAfter = balanceCol >= 0 ? parseNumber(line[balanceCol] ?? "") : null;
    const description = descCol >= 0 ? (line[descCol] ?? "").trim() : "";

    if (credit != null && credit > 0) {
      rows.push({ date, description, category: "credit", amount: credit, balanceAfter });
      continue;
    }
    if (debit != null && debit > 0) {
      rows.push({ date, description, category: "debit", amount: debit, balanceAfter });
      continue;
    }

    // Fallback: single amount column
    for (let i = 0; i < line.length; i++) {
      if (i === dateCol || i === descCol || i === balanceCol) continue;
      const n = parseNumber(line[i] ?? "");
      if (n != null && n !== 0) {
        rows.push({
          date,
          description,
          category: n > 0 ? "credit" : "debit",
          amount: Math.abs(n),
          balanceAfter,
        });
        break;
      }
    }
  }
  return rows;
}

function detectHeaderRow(
  rows: string[][],
  bankCode: DepositBank,
): { headerIndex: number; headers: string[] } | null {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i]!;
    if (looksLikeHeaderRow(row, bankCode)) {
      return { headerIndex: i, headers: row };
    }
  }
  return null;
}

export function parseBankStatementCsv(bankCode: DepositBank, rawText: string): ParsedStatementRow[] {
  const text = stripBom(rawText.trim());
  if (!text) return [];

  const rows = parseCsvRows(text);
  if (rows.length === 0) return [];

  const headerInfo = detectHeaderRow(rows, bankCode);
  if (headerInfo) {
    const dataRows = rows.slice(headerInfo.headerIndex + 1);
    const parsed = parseWithHeaders(bankCode, headerInfo.headers, dataRows);
    if (parsed.length > 0) return parsed;
  }

  // Fallback: assume first row is header
  if (rows.length >= 2) {
    const parsed = parseWithHeaders(bankCode, rows[0]!, rows.slice(1));
    if (parsed.length > 0) return parsed;
  }

  return [];
}
