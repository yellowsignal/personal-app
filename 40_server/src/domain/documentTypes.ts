export type DocumentType = "license" | "passport" | "idcard" | "certificate";

export interface DocumentRecord {
  id: number;
  userId: number;
  familyId: number | null;
  docType: DocumentType;
  docNumber: string | null;
  expiryDate: Date | null;
  imageUrl: string | null;
  isShared: boolean;
  createdAt: Date;
}

export interface PublicDocument {
  id: number;
  userId: number;
  familyId: number | null;
  docType: DocumentType;
  docNumber: string | null;
  expiryDate: string | null; // YYYY-MM-DD
  imageUrl: string | null;
  isShared: boolean;
  createdAt: string;
  ownerName: string;
}

export function toPublicDocument(record: DocumentRecord, ownerName: string): PublicDocument {
  return {
    id: record.id,
    userId: record.userId,
    familyId: record.familyId,
    docType: record.docType,
    docNumber: record.docNumber,
    expiryDate: record.expiryDate ? record.expiryDate.toISOString().slice(0, 10) : null,
    imageUrl: record.imageUrl,
    isShared: record.isShared,
    createdAt: record.createdAt.toISOString(),
    ownerName,
  };
}

