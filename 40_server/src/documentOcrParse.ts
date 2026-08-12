import type { DocumentCategory } from "./documentCategories.js";
import { inferCategoryFromTypeLabel } from "./documentCategories.js";

export interface OcrParsedField {
  label: string;
  value: string;
  isSecret: boolean;
}

export interface OcrParseResult {
  typeLabel: string | null;
  category: DocumentCategory | null;
  fields: OcrParsedField[];
  expiryDate: string | null;
}

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[〇○]/g, "0")
    .replace(/[－—–]/g, "-")
    .replace(/[Il|]/g, (ch, idx, src) => {
      const prev = src[idx - 1];
      const next = src[idx + 1];
      if (prev && /\d/.test(prev) && next && /\d/.test(next)) return "1";
      return ch;
    });
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function parseDateFragment(raw: string): string | null {
  const m = raw.match(/(\d{4})\s*[./年\-]\s*(\d{1,2})\s*[./月\-]\s*(\d{1,2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function cardMonthEndIso(month: number, yearPart: number): string | null {
  if (month < 1 || month > 12) return null;
  const year = yearPart < 100 ? 2000 + yearPart : yearPart;
  if (year < 1990 || year > 2100) return null;
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

function findCardExpiry(text: string): string | null {
  const keyword =
    /(?:valid|good|thru|through|until|expires?|exp\.?|유효|만료|有効|期限|月\/年|month\/year)/i;

  const mmYy = /(\d{1,2})\s*[/.-]\s*(\d{2,4})/g;
  const candidates: string[] = [];

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const searchLines = keyword.test(line) ? [line, lines[i + 1] ?? ""] : [line];
    for (const chunk of searchLines) {
      mmYy.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = mmYy.exec(chunk)) !== null) {
        const a = Number(m[1]);
        const b = Number(m[2]);
        if (b >= 100) {
          const iso = cardMonthEndIso(a, b);
          if (iso) candidates.push(iso);
          continue;
        }
        if (a >= 1 && a <= 12 && b <= 99) {
          const iso = cardMonthEndIso(a, b);
          if (iso) candidates.push(iso);
          continue;
        }
        if (b >= 1 && b <= 12 && a <= 99) {
          const iso = cardMonthEndIso(b, a);
          if (iso) candidates.push(iso);
        }
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort();
  return candidates.at(-1) ?? null;
}

function findExpiry(text: string): string | null {
  const lines = text.split("\n");
  const keyword = /(有効期限|期限|満了|expir|valid until|까지|만료|valid)/i;
  for (let i = 0; i < lines.length; i++) {
    if (keyword.test(lines[i] ?? "")) {
      const inline = parseDateFragment(lines[i] ?? "");
      if (inline) return inline;
      const next = parseDateFragment(lines[i + 1] ?? "");
      if (next) return next;
    }
  }

  const dates: string[] = [];
  const re = /(\d{4})\s*[./年\-]\s*(\d{1,2})\s*[./月\-]\s*(\d{1,2})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const d = parseDateFragment(m[0]);
    if (d) dates.push(d);
  }
  if (dates.length > 0) {
    dates.sort();
    return dates.at(-1) ?? null;
  }

  return findCardExpiry(text);
}

function looksLikeCardNumber(digits: string): boolean {
  if (!/^\d{15,16}$/.test(digits)) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  return true;
}

function extractCardNumber(text: string): string | null {
  const patterns = [
    /\d{4}[ \t-]?\d{4}[ \t-]?\d{4}[ \t-]?\d{4}/g,
    /\d{4}[ \t-]?\d{6}[ \t-]?\d{5}/g,
    /\d{16}/g,
    /\d{15}/g,
  ];

  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const digits = digitsOnly(m[0]);
      if (looksLikeCardNumber(digits)) return digits;
    }
  }
  return null;
}

function detectType(text: string, cardNumber: string | null): string | null {
  if (/在留|재류|residence card|zairyu/i.test(text)) return "在留カード";
  if (/保険証|健康保険|被保険/i.test(text)) return "保険証";
  if (/マイナンバー|my number|個人番号/i.test(text)) return "マイナンバーカード";
  if (/運転免許|운전면허|driver'?s license/i.test(text)) return "運転免許証";
  if (/旅券|passport|여권/i.test(text)) return "여권";
  if (/체크|debit card|デビット/i.test(text)) return "체크카드";
  if (
    /신용|credit card|credit|クレジット|クレジットカード/i.test(text) ||
    /\bvisa\b/i.test(text) ||
    /\bmastercard\b/i.test(text) ||
    /\bmaster card\b/i.test(text) ||
    /\bamex\b/i.test(text) ||
    /\bjcb\b/i.test(text) ||
    /\bunionpay\b/i.test(text) ||
    /신한카드|삼성카드|현대카드|롯데카드|우리카드|하나카드|KB국민|국민카드|NH농협|농협카드|BC카드/i.test(text)
  ) {
    return /체크|debit|デビット/i.test(text) ? "체크카드" : "신용카드";
  }
  if (/주민등록|住民/i.test(text)) return "주민등록증";
  const shinsatsuken = detectShinsatsukenType(text);
  if (shinsatsuken) return shinsatsuken;
  if (cardNumber) return "신용카드";
  return null;
}

function detectShinsatsukenType(text: string): string | null {
  if (!/診察券|患者番号|患者Ｎｏ|受付番号|診療/i.test(text)) return null;
  const hospital = text.match(/([\u4e00-\u9fff\u3040-\u30ffーA-Za-z0-9]+(?:病院|クリニック|医院|診療所|メディカル))/);
  if (hospital?.[1]) return hospital[1];
  return "診察券";
}

function pushUnique(fields: OcrParsedField[], field: OcrParsedField): void {
  if (!field.value.trim()) return;
  const fieldDigits = digitsOnly(field.value);
  if (
    fields.some((f) => {
      if (f.label !== field.label) return false;
      if (f.value === field.value) return true;
      if (field.label === "카드번호" && fieldDigits.length >= 15) {
        return digitsOnly(f.value) === fieldDigits;
      }
      return false;
    })
  ) {
    return;
  }
  fields.push(field);
}

function extractLabeledFields(text: string): OcrParsedField[] {
  const fields: OcrParsedField[] = [];
  const patterns: Array<{ label: string; re: RegExp; isSecret: boolean }> = [
    { label: "記号", re: /記\s*号[：:\s]*([0-9]{1,6})/i, isSecret: false },
    { label: "番号", re: /番\s*号[：:\s]*([0-9]{1,12})/i, isSecret: true },
    { label: "患者番号", re: /患者(?:番号|Ｎｏ|No|编号)[：:\s]*([0-9]{1,12})/i, isSecret: false },
    { label: "受付番号", re: /受付(?:番号|No)[：:\s]*([0-9]{1,12})/i, isSecret: false },
    { label: "枝番", re: /枝\s*番[：:\s]*([0-9]{1,4})/i, isSecret: true },
    { label: "기호", re: /기\s*호[：:\s]*([0-9\-]{3,})/i, isSecret: false },
    { label: "번호", re: /(?:번\s*호|번호)[：:\s]*([0-9\-]{4,})/i, isSecret: true },
    { label: "카드번호", re: /(?:카드|card)[^\d]{0,12}([0-9\s\-]{13,22})/i, isSecret: true },
    { label: "CVC", re: /(?:CVC|CVV|CID)[：:\s]*([0-9]{3,4})/i, isSecret: true },
  ];

  for (const p of patterns) {
    const m = text.match(p.re);
    if (m?.[1]) {
      const value = p.label === "카드번호" || p.label === "CVC" ? digitsOnly(m[1]) : m[1].replace(/\s/g, "").trim();
      pushUnique(fields, {
        label: p.label,
        value,
        isSecret: p.isSecret,
      });
    }
  }
  return fields;
}

function extractSpecialNumbers(text: string, typeLabel: string | null): OcrParsedField[] {
  const fields: OcrParsedField[] = [];
  const compact = text.replace(/\s/g, "");

  const zairyu = compact.match(/[A-Z]{2}\d{8}[A-Z]{2}/i);
  if (zairyu) {
    pushUnique(fields, { label: "在留カード番号", value: zairyu[0]!.toUpperCase(), isSecret: true });
  }

  const passport = text.match(/\b([A-Z]{1,2}\d{7,8})\b/);
  if (passport && (typeLabel?.includes("여권") || /passport|旅券/i.test(text))) {
    pushUnique(fields, { label: "여권번호", value: passport[1]!.toUpperCase(), isSecret: true });
  }

  const license = text.match(/\b(\d{2}-\d{2}-\d{6}-\d{2})\b/);
  if (license) {
    pushUnique(fields, { label: "면허번호", value: license[1]!, isSecret: true });
  }

  const myNumber = text.match(/(?:個人番号|マイナンバー)[：:\s]*(\d{4}\s*\d{4}\s*\d{4})/);
  if (myNumber) {
    pushUnique(fields, {
      label: "マイナンバー",
      value: myNumber[1]!.replace(/\s/g, ""),
      isSecret: true,
    });
  }

  const cardNumber = extractCardNumber(text);
  if (cardNumber) {
    pushUnique(fields, {
      label: "카드번호",
      value: cardNumber,
      isSecret: true,
    });
  }

  return fields;
}

export function parseDocumentOcrText(text: string): OcrParseResult {
  const normalized = normalizeText(text);
  const cardNumber = extractCardNumber(normalized);
  const typeLabel = detectType(normalized, cardNumber);
  const isMedical = /診察券|患者番号|患者Ｎｏ|受付番号|診療/i.test(normalized);
  const category = isMedical
    ? "medical"
    : typeLabel
      ? inferCategoryFromTypeLabel(typeLabel)
      : null;
  const fields = extractLabeledFields(normalized);
  for (const s of extractSpecialNumbers(normalized, typeLabel)) {
    pushUnique(fields, s);
  }

  if (fields.length === 0) {
    const fallback = normalized.match(/\b[\dA-Z\-]{10,}\b/);
    if (fallback?.[0]) {
      pushUnique(fields, { label: "번호", value: fallback[0], isSecret: true });
    }
  }

  return {
    typeLabel,
    category,
    fields,
    expiryDate: findExpiry(normalized),
  };
}
