import type { DocumentRecord, DocumentType, PublicDocument } from "./documentTypes.js";

export interface CreateDocumentInput {
  userId: number;
  familyId: number | null;
  docType: DocumentType;
  docNumber: string | null;
  expiryDate: Date | null;
  imageUrl: string | null;
  isShared: boolean;
}

export interface UpdateDocumentInput {
  docType?: DocumentType;
  docNumber?: string | null;
  expiryDate?: Date | null;
  imageUrl?: string | null;
  isShared?: boolean;
  familyId?: number | null;
}

export interface DocumentRepository {
  findById(id: number): Promise<DocumentRecord | null>;
  listForUser(userId: number, familyId: number | null): Promise<DocumentRecord[]>;
  create(input: CreateDocumentInput): Promise<DocumentRecord>;
  update(id: number, input: UpdateDocumentInput): Promise<DocumentRecord>;
  remove(id: number): Promise<boolean>;
}

