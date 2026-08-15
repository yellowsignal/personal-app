import type { DocumentCategory } from "./documentCategories.js";
import { inferCategoryFromTypeLabel } from "./documentCategories.js";
import {
  isOcrDocKind,
  isPhotoOnlyOcrKind,
  OCR_DOC_KIND_ORDER,
  OCR_DOC_KINDS_BY_REGION,
  OCR_DOC_SCHEMAS,
  type OcrDocKind,
} from "./documentOcrSchemas.js";

export type { OcrDocKind, OcrDocRegion, OcrDocSchema, OcrFieldSpec } from "./documentOcrSchemas.js";
export {
  OCR_DOC_KIND_ORDER,
  OCR_DOC_KINDS_BY_REGION,
  OCR_DOC_SCHEMAS,
  isOcrDocKind,
  isPhotoOnlyOcrKind,
};

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

export interface ParseDocumentOcrOptions {
  kind?: OcrDocKind | null;
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

/** JP landline/mobile styles — must not become 番号 / fallback. */
export function looksLikePhoneNumber(value: string): boolean {
  const trimmed = value.trim();
  const d = digitsOnly(trimmed);
  if (/^0\d{9,10}$/.test(d)) return true;
  if (/^0\d{1,4}-\d{1,4}-\d{3,4}$/.test(trimmed)) return true;
  return false;
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

/** Labels that mark issue / permission / birth — never treat their date as expiry. */
const ISSUE_OR_BIRTH_LABEL = /交付年月日|許可年月日|生年月日|発行日|資格取得/;

function datePrecededByIssueOrBirth(text: string, dateIndex: number): boolean {
  const before = text.slice(Math.max(0, dateIndex - 28), dateIndex);
  return ISSUE_OR_BIRTH_LABEL.test(before);
}

function pickLatestIso(dates: string[]): string | null {
  if (dates.length === 0) return null;
  dates.sort();
  return dates.at(-1) ?? null;
}

function findExpiry(text: string): string | null {
  // Strong signals for 在留カード / ID cards. Prefer these over any nearby 交付年月日.
  const strong: string[] = [];

  // 「2028年11月12日まで有効」— skip when OCR glues 交付年月日 onto the same date.
  const untilRe =
    /(\d{4})\s*[./年\-]\s*(\d{1,2})\s*[./月\-]\s*(\d{1,2})\s*日?\s*まで\s*有効/g;
  let m: RegExpExecArray | null;
  while ((m = untilRe.exec(text)) !== null) {
    if (datePrecededByIssueOrBirth(text, m.index)) continue;
    const iso = parseDateFragment(m[0] ?? "");
    if (iso) strong.push(iso);
  }

  // 「在留期間（満了日） 3年 2028年11月12日」— allow period text between label and date.
  const manryoRe =
    /満了日?[）)\]]?[^\d\n]{0,24}(\d{4}\s*[./年\-]\s*\d{1,2}\s*[./月\-]\s*\d{1,2}\s*日?)/g;
  while ((m = manryoRe.exec(text)) !== null) {
    const iso = parseDateFragment(m[1] ?? "");
    if (iso) strong.push(iso);
  }

  const yukoKigenRe =
    /有効期限\s*[：:\s]*(\d{4}\s*[./年\-]\s*\d{1,2}\s*[./月\-]\s*\d{1,2}\s*日?)/g;
  while ((m = yukoKigenRe.exec(text)) !== null) {
    const iso = parseDateFragment(m[1] ?? "");
    if (iso) strong.push(iso);
  }

  const fromStrong = pickLatestIso(strong);
  if (fromStrong) return fromStrong;

  const lines = text.split("\n");
  const keyword = /(有効期限|満了|まで\s*有効|expir|valid until|까지|만료)/i;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!keyword.test(line)) continue;
    if (ISSUE_OR_BIRTH_LABEL.test(line)) continue;

    const inline = parseDateFragment(line);
    if (inline) return inline;
    const next = parseDateFragment(lines[i + 1] ?? "");
    if (next) return next;
  }

  // Fallback: latest date that is not clearly an issue/birth/permission date.
  const dates: string[] = [];
  const re = /(\d{4})\s*[./年\-]\s*(\d{1,2})\s*[./月\-]\s*(\d{1,2})/g;
  while ((m = re.exec(text)) !== null) {
    if (datePrecededByIssueOrBirth(text, m.index)) continue;
    const before = text.slice(Math.max(0, m.index - 16), m.index);
    if (/(交付|許可|生年月|発行|取得)/.test(before)) continue;
    const d = parseDateFragment(m[0]);
    if (d) dates.push(d);
  }
  const fromFallback = pickLatestIso(dates);
  if (fromFallback) return fromFallback;

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

/** Paper/plastic 保険証 layout cue even when the title OCR is garbled. */
function looksLikeHokenText(text: string): boolean {
  return (
    /保険証|健康保険|被保険|保険者番号|保険者\s*番号/i.test(text) ||
    /記\s*号\s*[・･·．.／/\s]*\s*番\s*号/i.test(text)
  );
}

function detectType(text: string, cardNumber: string | null): string | null {
  if (/在留|재류|residence card|zairyu/i.test(text)) return "在留カード";
  if (looksLikeHokenText(text)) return "保険証";
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

/** 保険証: only trust an explicit 有効期限 — never 交付日 / random MM/YY / “latest date”. */
function findHokenExpiry(text: string): string | null {
  const yukoKigenRe =
    /有効期限\s*[：:\s]*(\d{4}\s*[./年\-]\s*\d{1,2}\s*[./月\-]\s*\d{1,2}\s*日?)/g;
  const dates: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = yukoKigenRe.exec(text)) !== null) {
    const iso = parseDateFragment(m[1] ?? "");
    if (iso) dates.push(iso);
  }
  return pickLatestIso(dates);
}

function detectShinsatsukenType(text: string): string | null {
  if (!/診察券|患者番号|患者Ｎｏ|受付番号|診療/i.test(text)) return null;
  const hospital = text.match(/([\u4e00-\u9fff\u3040-\u30ffーA-Za-z0-9]+(?:病院|クリニック|医院|診療所|メディカル))/);
  if (hospital?.[1]) return hospital[1];
  return "診察券";
}

function pushUnique(fields: OcrParsedField[], field: OcrParsedField): void {
  if (!field.value.trim()) return;
  if (looksLikePhoneNumber(field.value) && (field.label === "番号" || field.label === "번호" || field.label === "記号")) {
    return;
  }
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

/** Japanese health-insurance card: labels often sit above/beside values as 「記号・番号」. */
function extractHokenFields(text: string): OcrParsedField[] {
  const fields: OcrParsedField[] = [];

  const insurer = text.match(/保険者\s*番号[：:\s]*([0-9]{6,8})/i);
  if (insurer?.[1]) {
    pushUnique(fields, { label: "保険者番号", value: insurer[1], isSecret: false });
  }

  // 「記号・番号」 then two numbers on the same or following line (common paper layout)
  const combo =
    text.match(
      /記\s*号\s*[・･·．.／/\s]*\s*番\s*号[^\d\n]{0,40}(\d{2,6})\s*[・･·．.\s／/]*\s*(\d{3,12})/i,
    ) ??
    text.match(/記\s*号\s*[・･·．.／/\s]*\s*番\s*号\s*\n\s*(\d{2,6})\s+(\d{3,12})/i);

  if (combo?.[1] && combo[2]) {
    pushUnique(fields, { label: "記号", value: combo[1], isSecret: false });
    pushUnique(fields, { label: "番号", value: combo[2], isSecret: true });
  } else {
    // Separate lines: 記号 … \n 123 \n 番号 … \n 456
    const kigoLine = text.match(/記\s*号(?!\s*者)[^\d\n]{0,24}(\d{2,6})/i);
    const bangoLine = text.match(/(?<![保険者発通])番\s*号[^\d\n]{0,24}(\d{3,12})/i);
    if (kigoLine?.[1] && !looksLikePhoneNumber(kigoLine[1])) {
      pushUnique(fields, { label: "記号", value: kigoLine[1], isSecret: false });
    }
    if (bangoLine?.[1] && !looksLikePhoneNumber(bangoLine[1])) {
      // Avoid treating 保険者番号 digits as 番号 when already captured
      if (!insurer || bangoLine[1] !== insurer[1]) {
        pushUnique(fields, { label: "番号", value: bangoLine[1], isSecret: true });
      }
    }
  }

  const edaban =
    text.match(/[（(]?\s*枝\s*番\s*[）)]?\s*[：:\s]*([0-9]{1,4})/i) ??
    text.match(/枝\s*番[：:\s]*([0-9]{1,4})/i);
  if (edaban?.[1]) {
    pushUnique(fields, { label: "枝番", value: edaban[1], isSecret: true });
  }

  return fields;
}

function extractLabeledFields(text: string): OcrParsedField[] {
  const fields: OcrParsedField[] = [];
  const patterns: Array<{ label: string; re: RegExp; isSecret: boolean }> = [
    { label: "患者番号", re: /患者(?:番号|Ｎｏ|No|编号)[：:\s]*([0-9]{1,12})/i, isSecret: false },
    { label: "受付番号", re: /受付(?:番号|No)[：:\s]*([0-9]{1,12})/i, isSecret: false },
    { label: "기호", re: /기\s*호[：:\s]*([0-9\-]{3,})/i, isSecret: false },
    { label: "번호", re: /(?:번\s*호|번호)[：:\s]*([0-9\-]{4,})/i, isSecret: true },
    { label: "카드번호", re: /(?:카드|card)[^\d]{0,12}([0-9\s\-]{13,22})/i, isSecret: true },
    { label: "CVC", re: /(?:CVC|CVV|CID)[：:\s]*([0-9]{3,4})/i, isSecret: true },
  ];

  for (const p of patterns) {
    const m = text.match(p.re);
    if (m?.[1]) {
      const value = p.label === "카드번호" || p.label === "CVC" ? digitsOnly(m[1]) : m[1].replace(/\s/g, "").trim();
      if ((p.label === "번호" || p.label === "기호") && looksLikePhoneNumber(value)) continue;
      pushUnique(fields, {
        label: p.label,
        value,
        isSecret: p.isSecret,
      });
    }
  }
  return fields;
}

function extractSpecialNumbers(
  text: string,
  typeLabel: string | null,
  options?: {
    skipCardNumber?: boolean;
    only?: Array<"zairyu" | "passport" | "license" | "mynumber" | "card">;
  },
): OcrParsedField[] {
  const fields: OcrParsedField[] = [];
  const compact = text.replace(/\s/g, "");
  const allow = (key: "zairyu" | "passport" | "license" | "mynumber" | "card") =>
    !options?.only || options.only.includes(key);

  if (allow("zairyu")) {
    const zairyu = compact.match(/[A-Z]{2}\d{8}[A-Z]{2}/i);
    if (zairyu) {
      pushUnique(fields, { label: "在留カード番号", value: zairyu[0]!.toUpperCase(), isSecret: true });
    }
  }

  if (allow("passport")) {
    const passport = text.match(/\b([A-Z]{1,2}\d{7,8})\b/);
    if (passport && (typeLabel?.includes("여권") || /passport|旅券/i.test(text) || options?.only)) {
      pushUnique(fields, { label: "여권번호", value: passport[1]!.toUpperCase(), isSecret: true });
    }
  }

  if (allow("license")) {
    const kr = text.match(/\b(\d{2}-\d{2}-\d{6}-\d{2})\b/);
    if (kr) {
      pushUnique(fields, { label: "면허번호", value: kr[1]!, isSecret: true });
    }
    const jp =
      text.match(/(?:免許証番号|免許番号)[：:\s第]*([0-9]{10,12})/) ??
      text.match(/\b(\d{4}\s?\d{4}\s?\d{4})\b/);
    if (jp?.[1] && !kr) {
      pushUnique(fields, {
        label: "免許番号",
        value: digitsOnly(jp[1]),
        isSecret: true,
      });
    }
  }

  if (allow("mynumber")) {
    const myNumber = text.match(/(?:個人番号|マイナンバー)[：:\s]*(\d{4}\s*\d{4}\s*\d{4})/);
    if (myNumber) {
      pushUnique(fields, {
        label: "マイナンバー",
        value: myNumber[1]!.replace(/\s/g, ""),
        isSecret: true,
      });
    }
  }

  // 保険証 digit clusters (保険者番号+記号+番号) often look like a 16-digit PAN — never treat as 카드번호.
  if (allow("card") && !options?.skipCardNumber) {
    const cardNumber = extractCardNumber(text);
    if (cardNumber) {
      pushUnique(fields, {
        label: "카드번호",
        value: cardNumber,
        isSecret: true,
      });
    }
  }

  return fields;
}

/** Score raw OCR text so we can pick the best page orientation. */
export function scoreOcrTextForDocuments(text: string): number {
  const t = normalizeText(text);
  let score = 0;
  if (/保険証|被保険|健康保険|保険者/.test(t)) score += 80;
  if (/記\s*号/.test(t)) score += 35;
  if (/番\s*号/.test(t)) score += 20;
  if (/在留カード|マイナンバー|クレジット|診察券|運転免許証/.test(t)) score += 50;
  if (/visa|mastercard|jcb|신용카드|체크카드/i.test(t)) score += 40;
  const cjk = (t.match(/[\u3040-\u30ff\u4e00-\u9fff]/g) ?? []).length;
  score += Math.min(45, cjk);
  const digits = (t.match(/\d/g) ?? []).length;
  score += Math.min(25, digits);
  if (t.trim().length < 24) score -= 40;
  if (looksLikePhoneNumber(t.trim()) || (/^\s*Tel/i.test(t) && digits < 12 && cjk < 5)) score -= 20;
  return score;
}

function extractCashCardFields(text: string): OcrParsedField[] {
  const fields: OcrParsedField[] = [];
  const bank =
    text.match(
      /([\u4e00-\u9fffA-Za-z・ー]{2,20}(?:銀行|信用金庫|信用組合|農協|労働金庫|JF|ゆうちょ銀行))/,
    ) ?? text.match(/(ゆうちょ銀行|三菱UFJ銀行|三井住友銀行|みずほ銀行|りそな銀行)/);
  if (bank?.[1]) {
    pushUnique(fields, { label: "金融機関", value: bank[1].trim(), isSecret: false });
  }
  const ten =
    text.match(/(?:店番\s*号|支店(?:コード|番号)?|店番)[：:\s]*([0-9]{3,4})/i) ??
    text.match(/\b店\s*([0-9]{3})\b/);
  if (ten?.[1]) {
    pushUnique(fields, { label: "店番号", value: ten[1], isSecret: false });
  }
  const koza = text.match(/(?:口座\s*番号|口座番)[：:\s]*([0-9]{6,8})/i);
  if (koza?.[1]) {
    pushUnique(fields, { label: "口座番号", value: koza[1], isSecret: true });
  }
  return fields;
}

function extractZairyuStatus(text: string): string | null {
  const m = text.match(
    /在留資格[：:\s]*([^\n]{2,40}?)(?:\n|就労|在留期間|許可|交付|$)/,
  );
  if (!m?.[1]) return null;
  return m[1].replace(/\s+/g, " ").trim();
}

function mergeSchemaFields(
  kind: OcrDocKind,
  extracted: OcrParsedField[],
): OcrParsedField[] {
  const schema = OCR_DOC_SCHEMAS[kind];
  const byLabel = new Map(extracted.map((f) => [f.label, f]));
  return schema.fields.map((spec) => {
    const hit = byLabel.get(spec.label);
    return {
      label: spec.label,
      value: hit?.value ?? "",
      isSecret: spec.isSecret,
    };
  });
}

export function parseDocumentOcrText(
  text: string,
  options?: ParseDocumentOcrOptions,
): OcrParseResult {
  const normalized = normalizeText(text);
  const kind = options?.kind && isOcrDocKind(options.kind) ? options.kind : null;

  if (kind) {
    return parseWithKindHint(normalized, kind);
  }

  return parseAutoDetect(normalized);
}

function parseWithKindHint(normalized: string, kind: OcrDocKind): OcrParseResult {
  const schema = OCR_DOC_SCHEMAS[kind];
  const extracted: OcrParsedField[] = [];
  let expiryDate: string | null = null;

  switch (kind) {
    case "jp_hoken":
      for (const f of extractHokenFields(normalized)) pushUnique(extracted, f);
      expiryDate = schema.trackExpiry ? findHokenExpiry(normalized) : null;
      break;
    case "jp_shinsatsu":
      // Photo-only — never OCR-parse hospital cards.
      break;
    case "jp_zairyu": {
      for (const s of extractSpecialNumbers(normalized, schema.typeLabel, {
        skipCardNumber: true,
        only: ["zairyu"],
      })) {
        pushUnique(extracted, s);
      }
      const status = extractZairyuStatus(normalized);
      if (status) pushUnique(extracted, { label: "在留資格", value: status, isSecret: false });
      expiryDate = findExpiry(normalized);
      break;
    }
    case "jp_credit":
    case "kr_credit":
      for (const f of extractLabeledFields(normalized)) {
        if (f.label === "카드번호" || f.label === "CVC") pushUnique(extracted, f);
      }
      for (const s of extractSpecialNumbers(normalized, schema.typeLabel, { only: ["card"] })) {
        pushUnique(extracted, s);
      }
      expiryDate = findCardExpiry(normalized) ?? findExpiry(normalized);
      break;
    case "jp_cash":
      for (const f of extractCashCardFields(normalized)) pushUnique(extracted, f);
      expiryDate = null;
      break;
    case "jp_mynumber":
      for (const s of extractSpecialNumbers(normalized, schema.typeLabel, {
        skipCardNumber: true,
        only: ["mynumber"],
      })) {
        pushUnique(extracted, s);
      }
      expiryDate = findExpiry(normalized);
      break;
    case "jp_license":
      for (const s of extractSpecialNumbers(normalized, schema.typeLabel, {
        skipCardNumber: true,
        only: ["license"],
      })) {
        pushUnique(extracted, s);
      }
      expiryDate = findExpiry(normalized);
      break;
    case "kr_passport":
      for (const s of extractSpecialNumbers(normalized, schema.typeLabel, {
        skipCardNumber: true,
        only: ["passport"],
      })) {
        pushUnique(extracted, s);
      }
      expiryDate = findExpiry(normalized);
      break;
    case "kr_license":
      for (const s of extractSpecialNumbers(normalized, schema.typeLabel, {
        skipCardNumber: true,
        only: ["license"],
      })) {
        pushUnique(extracted, s);
      }
      expiryDate = findExpiry(normalized);
      break;
  }

  return {
    typeLabel: schema.typeLabel,
    category: schema.category,
    fields: mergeSchemaFields(kind, extracted),
    expiryDate: schema.trackExpiry ? expiryDate : null,
  };
}

function parseAutoDetect(normalized: string): OcrParseResult {
  const isHoken = looksLikeHokenText(normalized);
  // Do not let 保険証 digit clusters drive credit-card type detection.
  const cardNumber = isHoken ? null : extractCardNumber(normalized);
  const typeLabel = detectType(normalized, cardNumber) ?? (isHoken ? "保険証" : null);
  const isMedical = /診察券|患者番号|患者Ｎｏ|受付番号|診療/i.test(normalized);
  const category = isMedical
    ? "medical"
    : typeLabel
      ? inferCategoryFromTypeLabel(typeLabel)
      : isHoken
        ? "insurance"
        : null;

  const fields: OcrParsedField[] = [];
  if (isHoken) {
    for (const f of extractHokenFields(normalized)) pushUnique(fields, f);
  }
  for (const f of extractLabeledFields(normalized)) {
    if (isHoken && (f.label === "카드번호" || f.label === "CVC")) continue;
    pushUnique(fields, f);
  }
  for (const s of extractSpecialNumbers(normalized, typeLabel, { skipCardNumber: isHoken })) {
    pushUnique(fields, s);
  }

  if (fields.length === 0) {
    const fallback = normalized.match(/\b[\dA-Z\-]{10,}\b/);
    if (fallback?.[0] && !looksLikePhoneNumber(fallback[0])) {
      pushUnique(fields, { label: "번호", value: fallback[0], isSecret: true });
    }
  }

  return {
    typeLabel: typeLabel ?? (isHoken ? "保険証" : null),
    category: category ?? (isHoken ? "insurance" : null),
    fields,
    expiryDate: isHoken ? findHokenExpiry(normalized) : findExpiry(normalized),
  };
}
