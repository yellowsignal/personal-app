import type {
  PrismaClient,
  Document as PrismaDocument,
} from "@prisma/client";
import type { DocumentRepository, CreateDocumentInput, UpdateDocumentInput } from "./documentRepository.js";
import type { DocumentRecord } from "./documentTypes.js";
import { parseDocumentCategory } from "../documentCategories.js";

function map(row: PrismaDocument): DocumentRecord {
  return {
    id: row.id,
    userId: row.userId,
    familyId: row.familyId,
    typeLabel: row.docType,
    category: parseDocumentCategory(row.category),
    fieldsJson: row.fieldsJson,
    docNumber: row.docNumber,
    expiryDate: row.expiryDate,
    imageUrl: row.imageUrl,
    isShared: row.isShared,
    memo: row.memo,
    createdAt: row.createdAt,
  };
}

export class PrismaDocumentRepository implements DocumentRepository {
  constructor(private readonly db: PrismaClient) {}

  async findById(id: number): Promise<DocumentRecord | null> {
    const row = await this.db.document.findUnique({ where: { id } });
    return row ? map(row) : null;
  }

  async listForUser(userId: number, familyId: number | null): Promise<DocumentRecord[]> {
    const rows = await this.db.document.findMany({
      where: familyId
        ? { OR: [{ userId }, { familyId, isShared: true }] }
        : { userId },
    });
    return rows.map(map);
  }

  async create(input: CreateDocumentInput): Promise<DocumentRecord> {
    const row = await this.db.document.create({
      data: {
        userId: input.userId,
        familyId: input.familyId,
        docType: input.typeLabel,
        category: input.category,
        docNumber: input.docNumber,
        fieldsJson: input.fieldsJson,
        expiryDate: input.expiryDate,
        imageUrl: input.imageUrl,
        isShared: input.isShared,
        memo: input.memo,
      },
    });
    return map(row);
  }

  async update(id: number, input: UpdateDocumentInput): Promise<DocumentRecord> {
    const row = await this.db.document.update({
      where: { id },
      data: {
        docType: input.typeLabel,
        category: input.category,
        docNumber: input.docNumber,
        fieldsJson: input.fieldsJson,
        expiryDate: input.expiryDate,
        imageUrl: input.imageUrl,
        isShared: input.isShared,
        memo: input.memo,
        familyId: input.familyId,
      },
    });
    return map(row);
  }

  async remove(id: number): Promise<boolean> {
    try {
      await this.db.document.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }
}
