import type { AuthRepository } from "../domain/authRepository.js";
import type { DocumentRepository } from "../domain/documentRepository.js";
import type { DocumentType, DocumentRecord, PublicDocument } from "../domain/documentTypes.js";
import { toPublicDocument } from "../domain/documentTypes.js";
import { HttpError } from "./authService.js";
import type { ViewScope } from "../domain/subscriptionTypes.js";

const DOC_TYPES = new Set<DocumentType>(["license", "passport", "idcard", "certificate"]);

function parseScope(value: unknown): ViewScope {
  if (value === "personal" || value === "family" || value === "all") return value;
  return "all";
}

function parseDocType(value: unknown): DocumentType {
  if (typeof value !== "string" || !DOC_TYPES.has(value as DocumentType)) {
    throw new HttpError(400, "docType must be one of license, passport, idcard, certificate");
  }
  return value as DocumentType;
}

function parseOptionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new HttpError(400, "docNumber must be a string");
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 100) : null;
}

function parseOptionalExpiryDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new HttpError(400, "expiryDate must be a string (YYYY-MM-DD)");
  // Expect YYYY-MM-DD from <input type="date">
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, "expiryDate must be YYYY-MM-DD");
  }
  const [y, m, d] = value.split("-").map((x) => Number(x));
  const date = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  return date;
}

export class DocumentService {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly documentRepo: DocumentRepository,
  ) {}

  private async requireUser(userId: number) {
    const user = await this.authRepo.findUserById(userId);
    if (!user) throw new HttpError(401, "unauthorized", "UNAUTHORIZED");
    return user;
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

    // Sort by nearest expiry first; null expiry goes last.
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
    const docType = parseDocType(body.docType);
    const docNumber = parseOptionalString(body.docNumber);
    const expiryDate = parseOptionalExpiryDate(body.expiryDate);
    const imageUrl = parseOptionalString(body.imageUrl);

    const isShared = body.isShared === true;
    if (isShared && !user.familyId) {
      throw new HttpError(400, "join a family before sharing documents", "NO_FAMILY");
    }

    const record = await this.documentRepo.create({
      userId: user.id,
      familyId: isShared ? user.familyId : null,
      docType,
      docNumber,
      expiryDate,
      imageUrl,
      isShared,
    });
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

    const updated: Parameters<DocumentRepository["update"]>[1] = {
      docType: typeof body.docType === "string" ? parseDocType(body.docType) : undefined,
      docNumber: "docNumber" in body ? parseOptionalString(body.docNumber) : undefined,
      expiryDate: "expiryDate" in body ? parseOptionalExpiryDate(body.expiryDate) : undefined,
      imageUrl: "imageUrl" in body ? parseOptionalString(body.imageUrl) : undefined,
      isShared: body.isShared === undefined ? undefined : isShared,
      familyId: body.isShared === undefined ? undefined : isShared ? user.familyId : null,
    };

    const record = await this.documentRepo.update(id, updated);
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
    const removed = await this.documentRepo.remove(id);
    if (!removed) throw new HttpError(404, "document not found", "NOT_FOUND");
  }
}

