import { apiFetch } from "./http";
import type { ViewScope } from "../components/ScopeToggle";

export type DocumentType = "license" | "passport" | "idcard" | "certificate";

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

export interface CreateDocumentInput {
  docType: DocumentType;
  docNumber: string | null;
  expiryDate: string; // YYYY-MM-DD
  imageUrl?: string | null;
  isShared?: boolean;
}

export const documentsApi = {
  list(token: string, scope: ViewScope = "all") {
    return apiFetch<PublicDocument[]>(`/api/documents?scope=${scope}`, { token });
  },

  get(token: string, id: number) {
    return apiFetch<PublicDocument>(`/api/documents/${id}`, { token });
  },

  create(token: string, body: CreateDocumentInput) {
    return apiFetch<PublicDocument>("/api/documents", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    });
  },
};

