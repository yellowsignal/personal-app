import { apiFetch, ApiError } from "./http";

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

export interface IcloudAlbumPhoto {
  id: string;
  caption: string | null;
  date: string | null;
  thumbUrl: string;
  fullUrl: string;
}

/** Fast list card — no Apple round-trip, photos not included. */
export interface IcloudAlbumSummary {
  id: number;
  url: string;
  name: string | null;
  nameLocked: boolean;
  photoCount: number | null;
  coverPhotoId: string | null;
  coverUrl: string | null;
  syncedAt: string | null;
}

export interface LinkedIcloudAlbum extends IcloudAlbumSummary {
  photos: IcloudAlbumPhoto[];
  error?: string;
}

export interface IcloudAlbumsResponse {
  albums: IcloudAlbumSummary[];
}

export const photosApi = {
  list(token: string) {
    return apiFetch<PublicPhoto[]>("/api/photos", { token });
  },

  async upload(
    token: string,
    file: Blob,
    opts: { caption?: string } = {},
  ): Promise<PublicPhoto> {
    const params = new URLSearchParams();
    if (opts.caption) params.set("caption", opts.caption);
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

  update(token: string, id: number, body: { caption?: string | null }) {
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

  icloudAlbums(token: string) {
    return apiFetch<IcloudAlbumsResponse>("/api/photos/icloud-albums", { token });
  },

  getIcloudAlbum(token: string, albumId: number) {
    return apiFetch<LinkedIcloudAlbum>(`/api/photos/icloud-albums/${albumId}`, { token });
  },

  addIcloudAlbum(token: string, url: string) {
    return apiFetch<LinkedIcloudAlbum>("/api/photos/icloud-albums", {
      method: "POST",
      token,
      body: JSON.stringify({ url }),
    });
  },

  updateIcloudAlbum(
    token: string,
    albumId: number,
    body: { url?: string; name?: string; coverPhotoId?: string },
  ) {
    return apiFetch<LinkedIcloudAlbum>(`/api/photos/icloud-albums/${albumId}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    });
  },

  removeIcloudAlbum(token: string, albumId: number) {
    return apiFetch<IcloudAlbumsResponse>(`/api/photos/icloud-albums/${albumId}`, {
      method: "DELETE",
      token,
    });
  },

  async downloadIcloudPhoto(token: string, albumId: number, photoId: string): Promise<Blob> {
    const res = await fetch(
      `/api/photos/icloud-albums/${albumId}/file?photo=${encodeURIComponent(photoId)}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      throw new ApiError(data.error ?? `request failed (${res.status})`, res.status, data.code);
    }
    return res.blob();
  },

  async fetchIcloudCover(token: string, coverUrl: string): Promise<Blob> {
    const res = await fetch(coverUrl, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      throw new ApiError(data.error ?? `request failed (${res.status})`, res.status, data.code);
    }
    return res.blob();
  },
};
