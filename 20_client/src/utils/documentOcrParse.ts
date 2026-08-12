export interface OcrParsedField {
  label: string;
  value: string;
  isSecret: boolean;
}

export interface OcrParseResult {
  typeLabel: string | null;
  fields: OcrParsedField[];
  expiryDate: string | null;
}

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[〇○]/g, "0")
    .replace(/[－—–]/g, "-");
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
  if (dates.length === 0) return null;
  dates.sort();
  return dates.at(-1) ?? null;
}

function detectType(text: string): string | null {
  if (/在留|재류|residence card|zairyu/i.test(text)) return "在留カード";
  if (/保険証|健康保険|被保険/i.test(text)) return "保険証";
  if (/マイナンバー|my number|個人番号/i.test(text)) return "マイナンバーカード";
  if (/運転免許|운전면허|driver'?s license/i.test(text)) return "運転免許証";
  if (/旅券|passport|여권/i.test(text)) return "여권";
  if (/신용|credit card|クレジット/i.test(text)) return "신용카드";
  if (/체크|debit/i.test(text)) return "체크카드";
  if (/주민등록|住民/i.test(text)) return "주민등록증";
  return null;
}

function pushUnique(fields: OcrParsedField[], field: OcrParsedField): void {
  if (!field.value.trim()) return;
  if (fields.some((f) => f.label === field.label && f.value === field.value)) return;
  fields.push(field);
}

function extractLabeledFields(text: string): OcrParsedField[] {
  const fields: OcrParsedField[] = [];
  const patterns: Array<{ label: string; re: RegExp; isSecret: boolean }> = [
    { label: "記号", re: /記\s*号[：:\s]*([0-9]{1,6})/i, isSecret: false },
    { label: "番号", re: /番\s*号[：:\s]*([0-9]{1,12})/i, isSecret: true },
    { label: "枝番", re: /枝\s*番[：:\s]*([0-9]{1,4})/i, isSecret: true },
    { label: "기호", re: /기\s*호[：:\s]*([0-9\-]{3,})/i, isSecret: false },
    { label: "번호", re: /(?:번\s*호|번호)[：:\s]*([0-9\-]{4,})/i, isSecret: true },
    { label: "카드번호", re: /(?:카드|card)[^\d]{0,8}([0-9\s\-]{13,22})/i, isSecret: true },
  ];

  for (const p of patterns) {
    const m = text.match(p.re);
    if (m?.[1]) {
      pushUnique(fields, {
        label: p.label,
        value: m[1].replace(/\s/g, "").trim(),
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

  const card = text.match(/\b(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4})\b/);
  if (card) {
    pushUnique(fields, {
      label: "카드번호",
      value: card[1]!.replace(/[\s-]/g, ""),
      isSecret: true,
    });
  }

  return fields;
}

export function parseDocumentOcrText(text: string): OcrParseResult {
  const normalized = normalizeText(text);
  const typeLabel = detectType(normalized);
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
    fields,
    expiryDate: findExpiry(normalized),
  };
}
