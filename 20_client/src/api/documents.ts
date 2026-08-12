import { startAuthentication } from "@simplewebauthn/browser";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { apiFetch, ApiError } from "./http";
import type { ViewScope } from "../components/ScopeToggle";

export interface PublicDocumentField {
  id: string;
  label: string;
  isSecret: boolean;
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
  hasScan: boolean;
}

export interface DocumentFieldInput {
  id?: string;
  label: string;
  isSecret?: boolean;
  value?: string;
}

export interface CreateDocumentInput {
  typeLabel: string;
  fields: DocumentFieldInput[];
  expiryDate?: string | null;
  imageUrl?: string | null;
  isShared?: boolean;
}

export const DOCUMENT_TYPE_SUGGESTIONS = [
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

  update(token: string, id: number, body: Partial<CreateDocumentInput>) {
    return apiFetch<PublicDocument>(`/api/documents/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    });
  },

  async revealFields(token: string, id: number) {
    const options = await apiFetch<PublicKeyCredentialRequestOptionsJSON>(
      `/api/documents/${id}/fields/reveal/options`,
      { method: "POST", token, body: "{}" },
    );
    const response: AuthenticationResponseJSON = await startAuthentication({ optionsJSON: options });
    return apiFetch<{ fields: Array<{ id: string; label: string; value: string }> }>(
      `/api/documents/${id}/fields/reveal/verify`,
      {
        method: "POST",
        token,
        body: JSON.stringify({ challenge: options.challenge, response }),
      },
    );
  },

  async uploadScan(token: string, id: number, pdf: Blob): Promise<PublicDocument> {
    const res = await fetch(`/api/documents/${id}/scan`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/pdf",
      },
      body: pdf,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    if (!res.ok) {
      throw new ApiError(data.error ?? `request failed (${res.status})`, res.status, data.code);
    }
    return data as PublicDocument;
  },

  async downloadScan(token: string, id: number): Promise<Blob> {
    const res = await fetch(`/api/documents/${id}/scan`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      throw new ApiError(data.error ?? `request failed (${res.status})`, res.status, data.code);
    }
    return res.blob();
  },

  async removeScan(token: string, id: number): Promise<PublicDocument> {
    return apiFetch<PublicDocument>(`/api/documents/${id}/scan`, {
      method: "DELETE",
      token,
    });
  },
};
