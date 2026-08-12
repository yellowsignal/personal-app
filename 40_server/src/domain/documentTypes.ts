import { randomBytes } from "node:crypto";

/** Stored in DB (fields_json column). Secret values are AES-GCM encrypted. */
export interface StoredDocumentField {
  id: string;
  label: string;
  isSecret: boolean;
  valueCipher?: string | null;
  valuePlain?: string | null;
}

export interface DocumentRecord {
  id: number;
  userId: number;
  familyId: number | null;
  /** Free-text label, e.g. "신용카드", "保険証" */
  typeLabel: string;
  fieldsJson: string | null;
  /** Legacy single-number column; migrated to fields on read when fieldsJson is empty */
  docNumber: string | null;
  expiryDate: Date | null;
  imageUrl: string | null;
  isShared: boolean;
  createdAt: Date;
}

export interface PublicDocumentField {
  id: string;
  label: string;
  isSecret: boolean;
  /** Plain value for non-secret fields; null for secret fields until reveal */
  value: string | null;
  hasValue: boolean;
}

export interface PublicDocument {
  id: number;
  userId: number;
  familyId: number | null;
  typeLabel: string;
  fields: PublicDocumentField[];
  expiryDate: string | null;
  imageUrl: string | null;
  isShared: boolean;
  createdAt: string;
  ownerName: string;
  hasSecrets: boolean;
}

export function newFieldId(): string {
  return randomBytes(8).toString("hex");
}

export function parseStoredFields(record: Pick<DocumentRecord, "fieldsJson" | "docNumber">): StoredDocumentField[] {
  if (record.fieldsJson) {
    try {
      const parsed = JSON.parse(record.fieldsJson) as unknown;
      if (!Array.isArray(parsed)) return [];
      const out: StoredDocumentField[] = [];
      for (const item of parsed) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>;
        const label = typeof row.label === "string" ? row.label.trim() : "";
        if (!label) continue;
        const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : newFieldId();
        const isSecret = row.isSecret === true;
        out.push({
          id,
          label: label.slice(0, 80),
          isSecret,
          valueCipher: isSecret && typeof row.valueCipher === "string" ? row.valueCipher : null,
          valuePlain: !isSecret && typeof row.valuePlain === "string" ? row.valuePlain : null,
        });
      }
      return out;
    } catch {
      return [];
    }
  }

  // Legacy: single plain docNumber → one secret field (re-encrypted on next edit)
  if (record.docNumber) {
    return [
      {
        id: "legacy-number",
        label: "번호",
        isSecret: true,
        valueCipher: null,
        valuePlain: record.docNumber,
      },
    ];
  }
  return [];
}

export function toPublicDocumentFields(stored: StoredDocumentField[]): PublicDocumentField[] {
  return stored.map((f) => {
    const hasValue = Boolean(f.isSecret ? f.valueCipher : f.valuePlain);
    return {
      id: f.id,
      label: f.label,
      isSecret: f.isSecret,
      value: f.isSecret ? null : f.valuePlain ?? null,
      hasValue,
    };
  });
}

export function toPublicDocument(record: DocumentRecord, ownerName: string): PublicDocument {
  const stored = parseStoredFields(record);
  const fields = toPublicDocumentFields(stored);
  return {
    id: record.id,
    userId: record.userId,
    familyId: record.familyId,
    typeLabel: record.typeLabel,
    fields,
    expiryDate: record.expiryDate ? record.expiryDate.toISOString().slice(0, 10) : null,
    imageUrl: record.imageUrl,
    isShared: record.isShared,
    createdAt: record.createdAt.toISOString(),
    ownerName,
    hasSecrets: fields.some((f) => f.isSecret && f.hasValue),
  };
}

export function serializeStoredFields(fields: StoredDocumentField[]): string {
  return JSON.stringify(fields);
}
