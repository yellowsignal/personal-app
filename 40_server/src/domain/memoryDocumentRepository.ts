import type { DocumentRepository, CreateDocumentInput, UpdateDocumentInput } from "./documentRepository.js";
import type { DocumentRecord } from "./documentTypes.js";

export class MemoryDocumentRepository implements DocumentRepository {
  private docs = new Map<number, DocumentRecord>();
  private nextId = 1;

  async findById(id: number): Promise<DocumentRecord | null> {
    const row = this.docs.get(id);
    return row ? { ...row } : null;
  }

  async listForUser(userId: number, familyId: number | null): Promise<DocumentRecord[]> {
    return [...this.docs.values()]
      .filter((d) => d.userId === userId || (familyId !== null && d.familyId === familyId && d.isShared))
      .map((d) => ({ ...d }))
      .sort((a, b) => (a.expiryDate?.getTime() ?? Infinity) - (b.expiryDate?.getTime() ?? Infinity) || b.createdAt.getTime() - a.createdAt.getTime());
  }

  async create(input: CreateDocumentInput): Promise<DocumentRecord> {
    const now = new Date();
    const record: DocumentRecord = {
      id: this.nextId++,
      userId: input.userId,
      familyId: input.familyId,
      typeLabel: input.typeLabel,
      fieldsJson: input.fieldsJson,
      docNumber: input.docNumber,
      expiryDate: input.expiryDate,
      imageUrl: input.imageUrl,
      isShared: input.isShared,
      createdAt: now,
    };
    this.docs.set(record.id, record);
    return { ...record };
  }

  async update(id: number, input: UpdateDocumentInput): Promise<DocumentRecord> {
    const existing = this.docs.get(id);
    if (!existing) throw Object.assign(new Error("document not found"), { code: "NOT_FOUND" });

    const updated: DocumentRecord = {
      ...existing,
      typeLabel: input.typeLabel === undefined ? existing.typeLabel : input.typeLabel,
      fieldsJson: input.fieldsJson === undefined ? existing.fieldsJson : input.fieldsJson,
      docNumber: input.docNumber === undefined ? existing.docNumber : input.docNumber,
      expiryDate: input.expiryDate === undefined ? existing.expiryDate : input.expiryDate,
      imageUrl: input.imageUrl === undefined ? existing.imageUrl : input.imageUrl,
      isShared: input.isShared === undefined ? existing.isShared : input.isShared,
      familyId: input.familyId === undefined ? existing.familyId : input.familyId,
    };
    this.docs.set(id, updated);
    return { ...updated };
  }

  async remove(id: number): Promise<boolean> {
    return this.docs.delete(id);
  }
}
