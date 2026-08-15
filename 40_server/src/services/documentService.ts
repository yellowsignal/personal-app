import { decryptSecret, encryptSecret } from "../auth/secretCrypto.js";
import type { AuthRepository } from "../domain/authRepository.js";
import type { CalendarRepository } from "../domain/calendarRepository.js";
import type { DocumentRepository } from "../domain/documentRepository.js";
import type { DocumentRecord, PublicDocument, StoredDocumentField } from "../domain/documentTypes.js";
import {
  newFieldId,
  parseStoredFields,
  serializeStoredFields,
  toPublicDocument,
} from "../domain/documentTypes.js";
import type { DocumentCategory } from "../documentCategories.js";
import { inferCategoryFromTypeLabel, parseDocumentCategory } from "../documentCategories.js";
import { HttpError } from "./authService.js";
import {
  documentExpiryReminderDescription,
  documentExpiryReminderEventTimes,
  documentExpiryReminderTitle,
} from "./documentExpiryReminder.js";
import type { FamilyActivityService } from "./familyActivityService.js";
import type { PasskeyService } from "./passkeyService.js";
import type { ViewScope } from "../domain/subscriptionTypes.js";
import type { DocumentScanStore, ScanSide } from "../storage/documentScanStore.js";
import { scanMarkerFromSides } from "../storage/documentScanStore.js";

const MAX_SCAN_BYTES = 8 * 1024 * 1024;

const TYPE_SUGGESTIONS = [
  "운전면허증",
  "여권",
  "주민등록증",
  "신용카드",
  "체크카드",
  "재류카드",
  "マイナンバーカード",
  "保険証",
  "자격증",
];

export interface DocumentFieldInput {
  id?: string;
  label: string;
  isSecret?: boolean;
  /** Omit on edit to keep existing secret value */
  value?: string;
}

function parseScope(value: unknown): ViewScope {
  if (value === "personal" || value === "family" || value === "all") return value;
  return "all";
}

function parseCategory(value: unknown, typeLabel: string): DocumentCategory {
  if (value !== undefined && value !== null && value !== "") {
    return parseDocumentCategory(value, inferCategoryFromTypeLabel(typeLabel));
  }
  return inferCategoryFromTypeLabel(typeLabel);
}

function parseTypeLabel(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, "typeLabel is required");
  }
  return value.trim().slice(0, 50);
}

function parseOptionalExpiryDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new HttpError(400, "expiryDate must be a string (YYYY-MM-DD)");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, "expiryDate must be YYYY-MM-DD");
  }
  const [y, m, d] = value.split("-").map((x) => Number(x));
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function parseOptionalString(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new HttpError(400, `${fieldName} must be a string`);
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

function parseMemo(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new HttpError(400, "memo must be a string");
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 2000) : null;
}

function parseFieldsInput(value: unknown): DocumentFieldInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(400, "fields must be a non-empty array");
  }
  if (value.length > 20) {
    throw new HttpError(400, "fields cannot exceed 20 items");
  }
  const out: DocumentFieldInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.trim() : "";
    if (!label) continue;
    out.push({
      id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : undefined,
      label: label.slice(0, 80),
      isSecret: row.isSecret === true,
      value: typeof row.value === "string" ? row.value : undefined,
    });
  }
  if (out.length === 0) {
    throw new HttpError(400, "at least one field with a label is required");
  }
  return out;
}

function buildStoredFields(
  inputs: DocumentFieldInput[],
  existing: StoredDocumentField[] = [],
): StoredDocumentField[] {
  const existingById = new Map(existing.map((f) => [f.id, f]));
  const out: StoredDocumentField[] = [];

  for (const input of inputs) {
    const id = input.id && existingById.has(input.id) ? input.id : newFieldId();
    const prev = existingById.get(id);
    const isSecret = input.isSecret === true;

    if (isSecret) {
      let valueCipher: string | null = prev?.valueCipher ?? null;
      if (input.value !== undefined) {
        const trimmed = input.value.trim();
        valueCipher = trimmed ? encryptSecret(trimmed) : null;
      }
      out.push({ id, label: input.label, isSecret: true, valueCipher, valuePlain: null });
    } else {
      const valuePlain =
        input.value !== undefined ? (input.value.trim() ? input.value.trim().slice(0, 500) : null) : (prev?.valuePlain ?? null);
      out.push({ id, label: input.label, isSecret: false, valueCipher: null, valuePlain });
    }
  }
  return out;
}

function decryptFieldValue(field: StoredDocumentField): string | null {
  if (!field.isSecret) return field.valuePlain ?? null;
  if (field.valueCipher) {
    try {
      return decryptSecret(field.valueCipher);
    } catch {
      throw new HttpError(500, "failed to decrypt field", "DECRYPT_FAILED");
    }
  }
  // Legacy plain docNumber migrated to secret field without cipher
  return field.valuePlain ?? null;
}

export class DocumentService {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly documentRepo: DocumentRepository,
    private readonly passkeyService: PasskeyService | null = null,
    private readonly scanStore: DocumentScanStore | null = null,
    private readonly activityService: FamilyActivityService | null = null,
    private readonly calendarRepo: CalendarRepository | null = null,
    private readonly kickReminders: (() => Promise<void>) | null = null,
  ) {}

  private async requireUser(userId: number) {
    const user = await this.authRepo.findUserById(userId);
    if (!user) throw new HttpError(401, "unauthorized", "UNAUTHORIZED");
    return user;
  }

  /** Upsert all-day calendar event at expiry−2 months with morning Web Push. */
  private async syncExpiryReminder(record: DocumentRecord): Promise<void> {
    if (!this.calendarRepo) return;
    if (!record.expiryDate) {
      await this.calendarRepo.removeBySourceDocumentId(record.id);
      return;
    }
    const times = documentExpiryReminderEventTimes(record.expiryDate);
    const title = documentExpiryReminderTitle(record.typeLabel);
    const description = documentExpiryReminderDescription(record.expiryDate);
    const existing = await this.calendarRepo.findBySourceDocumentId(record.id);
    if (existing) {
      const dateChanged = existing.startTime.getTime() !== times.startTime.getTime();
      await this.calendarRepo.update(existing.id, {
        title,
        description,
        startTime: times.startTime,
        endTime: times.endTime,
        isAllDay: times.isAllDay,
        category: "document_expiry",
        reminderMinutesBefore: times.reminderMinutesBefore,
        isShared: record.isShared,
        familyId: record.isShared ? record.familyId : null,
        ...(dateChanged ? { isReminderSent: false, reminderSentFor: null } : {}),
      });
    } else {
      await this.calendarRepo.create({
        userId: record.userId,
        familyId: record.isShared ? record.familyId : null,
        title,
        description,
        startTime: times.startTime,
        endTime: times.endTime,
        isAllDay: times.isAllDay,
        category: "document_expiry",
        sourceDocumentId: record.id,
        reminderMinutesBefore: times.reminderMinutesBefore,
        isShared: record.isShared,
      });
    }
    await this.kickReminders?.();
  }

  private canView(record: { userId: number; familyId: number | null; isShared: boolean }, familyId: number | null, userId: number) {
    if (record.userId === userId) return true;
    return Boolean(record.isShared && familyId !== null && record.familyId !== null && record.familyId === familyId);
  }

  private canModify(record: { userId: number }, userId: number) {
    return record.userId === userId;
  }

  private filterScope(items: PublicDocument[], scope: ViewScope, userId: number): PublicDocument[] {
    if (scope === "personal") return items.filter((d) => d.userId === userId && !d.isShared);
    if (scope === "family") return items.filter((d) => d.isShared);
    return items;
  }

  private async withOwners(records: DocumentRecord[]): Promise<PublicDocument[]> {
    const nameCache = new Map<number, string>();
    const out: PublicDocument[] = [];
    for (const record of records) {
      let ownerName = nameCache.get(record.userId);
      if (!ownerName) {
        const owner = await this.authRepo.findUserById(record.userId);
        ownerName = owner?.name ?? "Unknown";
        nameCache.set(record.userId, ownerName);
      }
      out.push(toPublicDocument(record, ownerName));
    }
    return out;
  }

  async list(userId: number, scopeRaw: unknown): Promise<PublicDocument[]> {
    const user = await this.requireUser(userId);
    const scope = parseScope(scopeRaw);
    const records = await this.documentRepo.listForUser(userId, user.familyId);

    // Lazy backfill: older docs created before expiry reminders existed.
    if (this.calendarRepo) {
      for (const record of records) {
        if (!record.expiryDate) continue;
        if (record.userId !== user.id) continue;
        const linked = await this.calendarRepo.findBySourceDocumentId(record.id);
        if (!linked) await this.syncExpiryReminder(record);
      }
    }

    records.sort(
      (a, b) =>
        (a.expiryDate?.getTime() ?? Infinity) - (b.expiryDate?.getTime() ?? Infinity) ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    );

    const withOwners = await this.withOwners(records);
    return this.filterScope(withOwners, scope, userId);
  }

  async get(userId: number, id: number): Promise<PublicDocument> {
    const user = await this.requireUser(userId);
    const existing = await this.documentRepo.findById(id);
    if (!existing) throw new HttpError(404, "document not found", "NOT_FOUND");
    if (!this.canView(existing, user.familyId, user.id)) {
      throw new HttpError(403, "forbidden", "FORBIDDEN");
    }
    const owner = await this.authRepo.findUserById(existing.userId);
    return toPublicDocument(existing, owner?.name ?? "Unknown");
  }

  async create(userId: number, body: Record<string, unknown>): Promise<PublicDocument> {
    const user = await this.requireUser(userId);
    const typeLabel = parseTypeLabel(body.typeLabel ?? body.docType);
    const category = parseCategory(body.category, typeLabel);
    const fieldInputs = parseFieldsInput(body.fields);
    const storedFields = buildStoredFields(fieldInputs);
    const hasAnyValue = storedFields.some((f) => (f.isSecret ? f.valueCipher : f.valuePlain));
    if (!hasAnyValue) {
      throw new HttpError(400, "at least one field value is required");
    }

    const expiryDate = parseOptionalExpiryDate(body.expiryDate);
    const imageUrl = parseOptionalString(body.imageUrl, "imageUrl");
    const memo = "memo" in body ? parseMemo(body.memo) : null;

    const isShared = body.isShared === true;
    if (isShared && !user.familyId) {
      throw new HttpError(400, "join a family before sharing documents", "NO_FAMILY");
    }

    const record = await this.documentRepo.create({
      userId: user.id,
      familyId: isShared ? user.familyId : null,
      typeLabel,
      category,
      fieldsJson: serializeStoredFields(storedFields),
      docNumber: null,
      expiryDate,
      imageUrl,
      isShared,
      memo,
    });
    if (isShared) {
      await this.activityService?.recordSharedCreate({
        familyId: record.familyId,
        actorUserId: user.id,
        actorName: user.name,
        entityType: "DOCUMENT",
        entityId: record.id,
        title: record.typeLabel,
      });
    }
    await this.syncExpiryReminder(record);
    return toPublicDocument(record, user.name);
  }

  async update(userId: number, id: number, body: Record<string, unknown>): Promise<PublicDocument> {
    const user = await this.requireUser(userId);
    const existing = await this.documentRepo.findById(id);
    if (!existing) throw new HttpError(404, "document not found", "NOT_FOUND");
    if (!this.canModify(existing, user.id)) {
      throw new HttpError(403, "only the owner can edit this document", "FORBIDDEN");
    }

    const isShared = body.isShared === undefined ? existing.isShared : body.isShared === true;
    if (isShared && !user.familyId) {
      throw new HttpError(400, "join a family before sharing documents", "NO_FAMILY");
    }

    const existingFields = parseStoredFields(existing);
    let fieldsJson = existing.fieldsJson;
    if ("fields" in body) {
      const fieldInputs = parseFieldsInput(body.fields);
      const storedFields = buildStoredFields(fieldInputs, existingFields);
      fieldsJson = serializeStoredFields(storedFields);
    }

    const updated: Parameters<DocumentRepository["update"]>[1] = {
      typeLabel:
        body.typeLabel !== undefined || body.docType !== undefined
          ? parseTypeLabel(body.typeLabel ?? body.docType)
          : undefined,
      category:
        body.category !== undefined
          ? parseCategory(body.category, body.typeLabel !== undefined ? parseTypeLabel(body.typeLabel) : existing.typeLabel)
          : body.typeLabel !== undefined || body.docType !== undefined
            ? parseCategory(undefined, parseTypeLabel(body.typeLabel ?? body.docType))
            : undefined,
      fieldsJson: "fields" in body ? fieldsJson : undefined,
      docNumber: "fields" in body ? null : undefined,
      expiryDate: "expiryDate" in body ? parseOptionalExpiryDate(body.expiryDate) : undefined,
      imageUrl: "imageUrl" in body ? parseOptionalString(body.imageUrl, "imageUrl") : undefined,
      memo: "memo" in body ? parseMemo(body.memo) : undefined,
      isShared: body.isShared === undefined ? undefined : isShared,
      familyId: body.isShared === undefined ? undefined : isShared ? user.familyId : null,
    };

    const record = await this.documentRepo.update(id, updated);
    await this.syncExpiryReminder(record);
    const owner = await this.authRepo.findUserById(record.userId);
    return toPublicDocument(record, owner?.name ?? "Unknown");
  }

  async remove(userId: number, id: number): Promise<void> {
    const user = await this.requireUser(userId);
    const existing = await this.documentRepo.findById(id);
    if (!existing) throw new HttpError(404, "document not found", "NOT_FOUND");
    if (!this.canModify(existing, user.id)) {
      throw new HttpError(403, "only the owner can delete this document", "FORBIDDEN");
    }
    if (this.calendarRepo) {
      await this.calendarRepo.removeBySourceDocumentId(id);
    }
    const removed = await this.documentRepo.remove(id);
    if (!removed) throw new HttpError(404, "document not found", "NOT_FOUND");
    if (this.scanStore) {
      await this.scanStore.remove(id);
    }
  }

  async uploadScanSide(
    userId: number,
    id: number,
    side: ScanSide,
    pdf: Buffer,
  ): Promise<PublicDocument> {
    if (!this.scanStore) {
      throw new HttpError(503, "scan storage not configured", "SCAN_UNAVAILABLE");
    }
    const user = await this.requireUser(userId);
    const existing = await this.documentRepo.findById(id);
    if (!existing) throw new HttpError(404, "document not found", "NOT_FOUND");
    if (!this.canModify(existing, user.id)) {
      throw new HttpError(403, "only the owner can upload a scan", "FORBIDDEN");
    }
    if (!pdf.length) {
      throw new HttpError(400, "PDF body is required");
    }
    if (pdf.length > MAX_SCAN_BYTES) {
      throw new HttpError(400, "PDF is too large (max 8MB)");
    }
    if (!pdf.subarray(0, 4).equals(Buffer.from("%PDF"))) {
      throw new HttpError(400, "file must be a PDF");
    }

    await this.scanStore.saveSide(id, side, pdf);
    const hasFront = await this.scanStore.hasSide(id, "front");
    const hasBack = await this.scanStore.hasSide(id, "back");
    const marker = scanMarkerFromSides(hasFront, hasBack);
    const record = await this.documentRepo.update(id, { imageUrl: marker });
    return toPublicDocument(record, user.name);
  }

  /** @deprecated use uploadScanSide */
  async uploadScan(userId: number, id: number, pdf: Buffer): Promise<PublicDocument> {
    return this.uploadScanSide(userId, id, "front", pdf);
  }

  async getScanSide(
    userId: number,
    id: number,
    side: ScanSide,
  ): Promise<{ buffer: Buffer; filename: string }> {
    if (!this.scanStore) {
      throw new HttpError(503, "scan storage not configured", "SCAN_UNAVAILABLE");
    }
    const user = await this.requireUser(userId);
    const existing = await this.documentRepo.findById(id);
    if (!existing) throw new HttpError(404, "document not found", "NOT_FOUND");
    if (!this.canView(existing, user.familyId, user.id)) {
      throw new HttpError(403, "forbidden", "FORBIDDEN");
    }
    const buffer = await this.scanStore.readSide(id, side);
    if (!buffer) {
      throw new HttpError(404, "no scan stored", "NO_SCAN");
    }
    const safeName =
      existing.typeLabel.replace(/[^\w\u3000-\u9fff\uac00-\ud7af-]+/g, "_").slice(0, 40) || "document";
    const suffix = side === "front" ? "" : "_back";
    return { buffer, filename: `${safeName}${suffix}.pdf` };
  }

  async getScan(userId: number, id: number): Promise<{ buffer: Buffer; filename: string }> {
    return this.getScanSide(userId, id, "front");
  }

  async removeScan(userId: number, id: number): Promise<PublicDocument> {
    if (!this.scanStore) {
      throw new HttpError(503, "scan storage not configured", "SCAN_UNAVAILABLE");
    }
    const user = await this.requireUser(userId);
    const existing = await this.documentRepo.findById(id);
    if (!existing) throw new HttpError(404, "document not found", "NOT_FOUND");
    if (!this.canModify(existing, user.id)) {
      throw new HttpError(403, "only the owner can delete a scan", "FORBIDDEN");
    }
    await this.scanStore.remove(id);
    const record = await this.documentRepo.update(id, { imageUrl: null });
    return toPublicDocument(record, user.name);
  }

  async revealFieldOptions(userId: number, id: number) {
    if (!this.passkeyService) {
      throw new HttpError(503, "passkey not configured", "PASSKEY_UNAVAILABLE");
    }
    const user = await this.requireUser(userId);
    const existing = await this.documentRepo.findById(id);
    if (!existing) throw new HttpError(404, "document not found", "NOT_FOUND");
    if (!this.canView(existing, user.familyId, user.id)) {
      throw new HttpError(403, "forbidden", "FORBIDDEN");
    }
    const fields = parseStoredFields(existing);
    const hasSecrets = fields.some((f) => f.isSecret && (f.valueCipher || f.valuePlain));
    if (!hasSecrets) {
      throw new HttpError(404, "no secret fields stored", "NO_SECRETS");
    }
    return this.passkeyService.credentialRevealOptions(user.id, "document", id);
  }

  async revealFields(
    userId: number,
    id: number,
    body: Record<string, unknown>,
  ): Promise<{ fields: Array<{ id: string; label: string; value: string }> }> {
    if (!this.passkeyService) {
      throw new HttpError(503, "passkey not configured", "PASSKEY_UNAVAILABLE");
    }
    const user = await this.requireUser(userId);
    const existing = await this.documentRepo.findById(id);
    if (!existing) throw new HttpError(404, "document not found", "NOT_FOUND");
    if (!this.canView(existing, user.familyId, user.id)) {
      throw new HttpError(403, "forbidden", "FORBIDDEN");
    }

    await this.passkeyService.credentialRevealVerify(user.id, "document", id, body);

    const stored = parseStoredFields(existing);
    const revealed = stored
      .filter((f) => f.isSecret && (f.valueCipher || f.valuePlain))
      .map((f) => {
        const value = decryptFieldValue(f);
        return value ? { id: f.id, label: f.label, value } : null;
      })
      .filter((x): x is { id: string; label: string; value: string } => x !== null);

    return { fields: revealed };
  }

  static typeSuggestions(): string[] {
    return TYPE_SUGGESTIONS;
  }
}
