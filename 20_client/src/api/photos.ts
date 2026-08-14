import { apiFetch, ApiError } from "./http";
import type { ViewScope } from "../components/ScopeToggle";

export interface PublicPhoto {
  id: number;
  userId: number;
  familyId: number | null;
  caption: string | null;
  isShared: boolean;
  createdAt: string;
  ownerName: string;
  editable: boolean;
  fileUrl: string;
}

export const photosApi = {
  list(token: string, scope: ViewScope = "all") {
    return apiFetch<PublicPhoto[]>(`/api/photos?scope=${scope}`, { token });
  },

  async upload(
    token: string,
    file: Blob,
    opts: { caption?: string; isShared?: boolean } = {},
  ): Promise<PublicPhoto> {
    const params = new URLSearchParams();
    if (opts.caption) params.set("caption", opts.caption);
    if (opts.isShared) params.set("isShared", "true");
    const qs = params.toString();
    const res = await fetch(`/api/photos${qs ? `?${qs}` : ""}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": file.type || "application/octet-stream",
      },
      body: file,
    });
    const data = (await res.json().catch(() => ({}))) as PublicPhoto & { error?: string; code?: string };
    if (!res.ok) {
      throw new ApiError(data.error ?? `request failed (${res.status})`, res.status, data.code);
    }
    return data;
  },

  update(token: string, id: number, body: { caption?: string | null; isShared?: boolean }) {
    return apiFetch<PublicPhoto>(`/api/photos/${id}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    });
  },

  remove(token: string, id: number) {
    return apiFetch<void>(`/api/photos/${id}`, {
      method: "DELETE",
      token,
    });
  },

  async downloadFile(token: string, id: number): Promise<Blob> {
    const res = await fetch(`/api/photos/${id}/file`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      throw new ApiError(data.error ?? `request failed (${res.status})`, res.status, data.code);
    }
    return res.blob();
  },
};
