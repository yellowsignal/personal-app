import type { DocumentRecord } from "./documentTypes.js";

import type { DocumentCategory } from "../documentCategories.js";

export interface CreateDocumentInput {
  userId: number;
  familyId: number | null;
  typeLabel: string;
  category: DocumentCategory;
  fieldsJson: string | null;
  docNumber: string | null;
  expiryDate: Date | null;
  imageUrl: string | null;
  isShared: boolean;
  memo: string | null;
}

export interface UpdateDocumentInput {
  typeLabel?: string;
  category?: DocumentCategory;
  fieldsJson?: string | null;
  docNumber?: string | null;
  expiryDate?: Date | null;
  imageUrl?: string | null;
  isShared?: boolean;
  memo?: string | null;
  familyId?: number | null;
}

export interface DocumentRepository {
  findById(id: number): Promise<DocumentRecord | null>;
  listForUser(userId: number, familyId: number | null): Promise<DocumentRecord[]>;
  create(input: CreateDocumentInput): Promise<DocumentRecord>;
  update(id: number, input: UpdateDocumentInput): Promise<DocumentRecord>;
  remove(id: number): Promise<boolean>;
}
