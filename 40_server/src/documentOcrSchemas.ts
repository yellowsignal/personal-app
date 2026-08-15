import type { DocumentCategory } from "./documentCategories.js";

/**
 * Document kinds the family actually uses (extend later as needed).
 * Grouped JP / KR for the OCR type picker.
 */
export type OcrDocKind =
  | "jp_zairyu"
  | "jp_credit"
  | "jp_cash"
  | "jp_mynumber"
  | "jp_license"
  | "jp_hoken"
  | "jp_shinsatsu"
  | "kr_passport"
  | "kr_license"
  | "kr_credit";

export type OcrDocRegion = "jp" | "kr";

export interface OcrFieldSpec {
  label: string;
  isSecret: boolean;
  /** Short note for maintainers / future Vision prompts. */
  note?: string;
}

export interface OcrDocSchema {
  region: OcrDocRegion;
  typeLabel: string;
  category: DocumentCategory;
  /** Always show these rows on the OCR review form (empty if unread). */
  fields: OcrFieldSpec[];
  /** Look for an expiry date after OCR. */
  trackExpiry: boolean;
  /**
   * Hospital cards vary too much for OCR — capture photos only and present
   * via show-mode when the clinic accepts a screen.
   */
  photoOnly?: boolean;
}

export const OCR_DOC_KIND_ORDER: OcrDocKind[] = [
  "jp_zairyu",
  "jp_credit",
  "jp_cash",
  "jp_mynumber",
  "jp_license",
  "jp_hoken",
  "jp_shinsatsu",
  "kr_passport",
  "kr_license",
  "kr_credit",
];

export const OCR_DOC_KINDS_BY_REGION: Record<OcrDocRegion, OcrDocKind[]> = {
  jp: [
    "jp_zairyu",
    "jp_credit",
    "jp_cash",
    "jp_mynumber",
    "jp_license",
    "jp_hoken",
    "jp_shinsatsu",
  ],
  kr: ["kr_passport", "kr_license", "kr_credit"],
};

/**
 * Expected numbers / labels per card type (from official layouts + common bank cards).
 * OCR fills matching labels; empty slots stay for manual edit.
 */
export const OCR_DOC_SCHEMAS: Record<OcrDocKind, OcrDocSchema> = {
  jp_zairyu: {
    region: "jp",
    typeLabel: "在留カード",
    category: "id",
    trackExpiry: true,
    fields: [
      {
        label: "在留カード番号",
        isSecret: true,
        note: "英2+数字8+英2 (例 UH30600371NA)",
      },
      { label: "在留資格", isSecret: false, note: "例 日本人の配偶者等" },
    ],
  },
  jp_credit: {
    region: "jp",
    typeLabel: "신용카드",
    category: "card",
    trackExpiry: true,
    fields: [
      { label: "카드번호", isSecret: true, note: "15–16桁 PAN" },
      { label: "CVC", isSecret: true, note: "裏面 3–4桁" },
    ],
  },
  jp_cash: {
    region: "jp",
    typeLabel: "キャッシュカード",
    category: "card",
    trackExpiry: false,
    fields: [
      { label: "金融機関", isSecret: false, note: "銀行・信用金庫名" },
      { label: "店番号", isSecret: false, note: "支店コード 3桁が多い" },
      { label: "口座番号", isSecret: true, note: "7–8桁が多い" },
    ],
  },
  jp_mynumber: {
    region: "jp",
    typeLabel: "マイナンバーカード",
    category: "id",
    trackExpiry: true,
    fields: [
      {
        label: "マイナンバー",
        isSecret: true,
        note: "個人番号 12桁 (裏面)",
      },
    ],
  },
  jp_license: {
    region: "jp",
    typeLabel: "運転免許証",
    category: "id",
    trackExpiry: true,
    fields: [
      {
        label: "免許番号",
        isSecret: true,
        note: "日本 12桁数字が多い",
      },
    ],
  },
  jp_hoken: {
    region: "jp",
    typeLabel: "保険証",
    category: "insurance",
    trackExpiry: false,
    fields: [
      { label: "保険者番号", isSecret: false, note: "健保8桁 / 国保6桁が多い" },
      { label: "記号", isSecret: false },
      { label: "番号", isSecret: true },
      { label: "枝番", isSecret: true, note: "個人識別 2桁" },
    ],
  },
  jp_shinsatsu: {
    region: "jp",
    typeLabel: "診察券",
    category: "medical",
    trackExpiry: false,
    photoOnly: true,
    fields: [
      {
        label: "病院名",
        isSecret: false,
        note: "病院ごとにデザインが違うため OCR しない。写真提示用。",
      },
    ],
  },
  kr_passport: {
    region: "kr",
    typeLabel: "여권",
    category: "id",
    trackExpiry: true,
    fields: [{ label: "여권번호", isSecret: true, note: "영문+숫자" }],
  },
  kr_license: {
    region: "kr",
    typeLabel: "운전면허증",
    category: "id",
    trackExpiry: true,
    fields: [
      {
        label: "면허번호",
        isSecret: true,
        note: "예 11-22-334455-60",
      },
    ],
  },
  kr_credit: {
    region: "kr",
    typeLabel: "신용카드",
    category: "card",
    trackExpiry: true,
    fields: [
      { label: "카드번호", isSecret: true },
      { label: "CVC", isSecret: true },
    ],
  },
};

export function isOcrDocKind(value: unknown): value is OcrDocKind {
  return typeof value === "string" && value in OCR_DOC_SCHEMAS;
}

export function isPhotoOnlyOcrKind(kind: OcrDocKind | null | undefined): boolean {
  return Boolean(kind && OCR_DOC_SCHEMAS[kind]?.photoOnly);
}
