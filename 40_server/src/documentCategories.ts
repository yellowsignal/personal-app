/** Stable API keys for document grouping (stored in DB). */
export const DOCUMENT_CATEGORIES = ["medical", "card", "id", "insurance", "certificate", "other"] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_CATEGORY_ORDER: DocumentCategory[] = [
  "medical",
  "card",
  "id",
  "insurance",
  "certificate",
  "other",
];

export function isDocumentCategory(value: unknown): value is DocumentCategory {
  return typeof value === "string" && (DOCUMENT_CATEGORIES as readonly string[]).includes(value);
}

export function parseDocumentCategory(value: unknown, fallback: DocumentCategory = "other"): DocumentCategory {
  if (isDocumentCategory(value)) return value;
  return fallback;
}

/** Infer category from a display name (typeLabel / docType). Used for migration and OCR fallback. */
export function inferCategoryFromTypeLabel(typeLabel: string): DocumentCategory {
  const t = typeLabel.trim();
  if (!t) return "other";
  if (/診察券|診察|患者番号/i.test(t)) return "medical";
  if (/保険証|健康保険|被保険/i.test(t)) return "insurance";
  if (/자격증|資格/i.test(t)) return "certificate";
  if (/신용|체크|credit|debit|クレジット|デビット|\bvisa\b|\bmastercard\b|\bjcb\b/i.test(t) && !/診察/.test(t)) return "card";
  if (/재류|在留|여권|passport|運転|면허|주민|マイナンバー|住民/i.test(t)) return "id";
  return "other";
}

/** Strip category suffix from typeLabel for cleaner display names (best-effort). */
export function normalizeTypeLabelForCategory(typeLabel: string, category: DocumentCategory): string {
  const trimmed = typeLabel.trim();
  if (!trimmed) return trimmed;
  if (category === "medical") {
    return trimmed.replace(/\s*診察券\s*$/u, "").trim() || trimmed;
  }
  return trimmed;
}
