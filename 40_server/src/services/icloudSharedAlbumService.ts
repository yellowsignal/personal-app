import type { AuthRepository } from "../domain/authRepository.js";
import type {
  FamilyIcloudAlbumRecord,
  FamilyIcloudAlbumRepository,
} from "../domain/familyIcloudAlbumRepository.js";
import { HttpError } from "./authService.js";
import {
  fetchIcloudSharedAlbum,
  parseIcloudSharedAlbumUrl,
  sortIcloudPhotosOldestFirst,
  IcloudAlbumError,
  type FetchLike,
  type IcloudAlbum,
  type IcloudAlbumPhoto,
} from "./icloudSharedAlbum.js";
import type { AlbumCoverStore } from "../storage/albumCoverStore.js";

export const MAX_FAMILY_ICLOUD_ALBUMS = 8;
const CACHE_TTL_MS = 45_000;
const DOWNLOAD_MAX_BYTES = 20 * 1024 * 1024;
const DOWNLOAD_MS = 20_000;
const COVER_MAX_BYTES = 2 * 1024 * 1024;

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

export class IcloudSharedAlbumService {
  private readonly cache = new Map<number, { url: string; at: number; album: IcloudAlbum }>();

  constructor(
    private readonly authRepo: AuthRepository,
    private readonly albumRepo: FamilyIcloudAlbumRepository,
    private readonly coverStore: AlbumCoverStore,
    private readonly http: FetchLike = fetch,
  ) {}

  private async requireFamily(userId: number) {
    const user = await this.authRepo.findUserById(userId);
    if (!user) throw new HttpError(401, "unauthorized", "UNAUTHORIZED");
    if (!user.familyId) throw new HttpError(400, "join a family first", "NO_FAMILY");
    const family = await this.authRepo.findFamilyById(user.familyId);
    if (!family) throw new HttpError(404, "family not found", "FAMILY_NOT_FOUND");
    return { user, family };
  }

  private remember(id: number, url: string, album: IcloudAlbum): void {
    this.cache.set(id, { url, at: Date.now(), album });
  }

  private toSummary(row: FamilyIcloudAlbumRecord): IcloudAlbumSummary {
    return {
      id: row.id,
      url: row.url,
      name: row.name,
      nameLocked: row.nameLocked,
      photoCount: row.photoCount,
      coverPhotoId: row.coverPhotoId,
      coverUrl: row.coverMime ? `/api/photos/icloud-albums/${row.id}/cover` : null,
      syncedAt: row.syncedAt ? row.syncedAt.toISOString() : null,
    };
  }

  private async requireAlbum(userId: number, albumId: number) {
    const { family } = await this.requireFamily(userId);
    const row = await this.albumRepo.findById(albumId);
    if (!row || row.familyId !== family.id) throw new HttpError(404, "album not found", "NOT_FOUND");
    return { family, row };
  }

  private async fetchAlbumOrThrow(url: string): Promise<IcloudAlbum> {
    try {
      return await fetchIcloudSharedAlbum(url, { http: this.http });
    } catch (err) {
      if (err instanceof IcloudAlbumError && /not found/i.test(err.message)) {
        throw new HttpError(
          400,
          "iCloud album not found — enable Public Website in the Photos app, then copy the link again",
          "ICLOUD_NOT_FOUND",
        );
      }
      throw new HttpError(400, "could not open iCloud album", "ICLOUD_FETCH_FAILED");
    }
  }

  private async downloadImage(url: string): Promise<{ bytes: Buffer; mime: string }> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), DOWNLOAD_MS);
    try {
      const response = await this.http(url, {
        method: "GET",
        headers: { "user-agent": "Photos/5.0", referer: "" },
        signal: ac.signal,
        redirect: "follow",
      });
      if (!response.ok) throw new HttpError(502, "could not download iCloud photo", "ICLOUD_FETCH_FAILED");
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > COVER_MAX_BYTES) throw new HttpError(400, "image is too large", "TOO_LARGE");
      const mimeHeader = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
      return { bytes, mime: mimeHeader.startsWith("image/") ? mimeHeader : "image/jpeg" };
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(502, "could not download iCloud photo", "ICLOUD_FETCH_FAILED");
    } finally {
      clearTimeout(timer);
    }
  }

  private pickCoverPhoto(photos: IcloudAlbumPhoto[], preferredId?: string | null): IcloudAlbumPhoto | null {
    if (preferredId) {
      const hit = photos.find((p) => p.id === preferredId);
      if (hit) return hit;
    }
    return sortIcloudPhotosOldestFirst(photos)[0] ?? null;
  }

  private async saveCoverFromPhoto(albumId: number, photo: IcloudAlbumPhoto): Promise<{
    coverPhotoId: string;
    coverMime: string;
  }> {
    const { bytes, mime } = await this.downloadImage(photo.thumbUrl || photo.fullUrl);
    await this.coverStore.save(albumId, bytes, mime);
    return { coverPhotoId: photo.id, coverMime: mime };
  }

  /** DB-only list — no Apple round-trips. */
  async list(userId: number): Promise<IcloudAlbumsResponse> {
    const { family } = await this.requireFamily(userId);
    const rows = await this.albumRepo.listByFamily(family.id);
    return { albums: rows.map((row) => this.toSummary(row)) };
  }

  async get(userId: number, albumId: number): Promise<LinkedIcloudAlbum> {
    const { row } = await this.requireAlbum(userId, albumId);
    return this.loadDetail(row);
  }

  private async loadDetail(row: FamilyIcloudAlbumRecord): Promise<LinkedIcloudAlbum> {
    const hit = this.cache.get(row.id);
    if (hit && hit.url === row.url && Date.now() - hit.at < CACHE_TTL_MS) {
      const photos = sortIcloudPhotosOldestFirst(hit.album.photos);
      return { ...this.toSummary(row), photos };
    }

    try {
      const album = await fetchIcloudSharedAlbum(row.url, { http: this.http });
      this.remember(row.id, row.url, album);
      const photos = sortIcloudPhotosOldestFirst(album.photos);
      const patch: Parameters<FamilyIcloudAlbumRepository["update"]>[1] = {
        photoCount: photos.length,
        syncedAt: new Date(),
      };
      if (!row.nameLocked && album.name && album.name !== row.name) {
        patch.name = album.name;
      }

      let next = await this.albumRepo.update(row.id, patch);

      const coverSource = this.pickCoverPhoto(photos, next.coverPhotoId);
      if (coverSource && (!next.coverMime || next.coverPhotoId !== coverSource.id || !(await this.coverStore.read(row.id)))) {
        try {
          const cover = await this.saveCoverFromPhoto(row.id, coverSource);
          next = await this.albumRepo.update(row.id, cover);
        } catch {
          /* keep previous cover if download fails */
        }
      }

      return { ...this.toSummary(next), photos };
    } catch (err) {
      const message = err instanceof IcloudAlbumError ? err.message : "could not load iCloud album";
      return { ...this.toSummary(row), photos: [], error: message };
    }
  }

  async add(userId: number, rawUrl: unknown): Promise<LinkedIcloudAlbum> {
    const { family } = await this.requireFamily(userId);
    const parsed = parseIcloudSharedAlbumUrl(rawUrl);
    if (!parsed) throw new HttpError(400, "invalid iCloud shared album URL", "INVALID_URL");
    const existing = await this.albumRepo.listByFamily(family.id);
    if (existing.some((row) => row.url === parsed.canonicalUrl)) {
      throw new HttpError(409, "this iCloud album is already linked", "ALBUM_EXISTS");
    }
    if (existing.length >= MAX_FAMILY_ICLOUD_ALBUMS) {
      throw new HttpError(400, `at most ${MAX_FAMILY_ICLOUD_ALBUMS} iCloud albums`, "ALBUM_LIMIT");
    }

    const album = await this.fetchAlbumOrThrow(parsed.canonicalUrl);
    const photos = sortIcloudPhotosOldestFirst(album.photos);
    const coverPhoto = photos[0] ?? null;

    let row = await this.albumRepo.create({
      familyId: family.id,
      url: parsed.canonicalUrl,
      name: album.name,
      nameLocked: false,
      photoCount: photos.length,
      syncedAt: new Date(),
    });
    this.remember(row.id, row.url, album);

    if (coverPhoto) {
      try {
        const cover = await this.saveCoverFromPhoto(row.id, coverPhoto);
        row = await this.albumRepo.update(row.id, cover);
      } catch {
        /* cover optional on link */
      }
    }

    return { ...this.toSummary(row), photos };
  }

  async update(
    userId: number,
    albumId: number,
    body: { url?: unknown; name?: unknown; coverPhotoId?: unknown },
  ): Promise<LinkedIcloudAlbum> {
    const { row } = await this.requireAlbum(userId, albumId);

    if (typeof body.url === "string" && body.url.trim()) {
      const parsed = parseIcloudSharedAlbumUrl(body.url);
      if (!parsed) throw new HttpError(400, "invalid iCloud shared album URL", "INVALID_URL");
      const siblings = await this.albumRepo.listByFamily(row.familyId);
      if (siblings.some((item) => item.id !== albumId && item.url === parsed.canonicalUrl)) {
        throw new HttpError(409, "this iCloud album is already linked", "ALBUM_EXISTS");
      }
      try {
        const album = await this.fetchAlbumOrThrow(parsed.canonicalUrl);
        const photos = sortIcloudPhotosOldestFirst(album.photos);
        let updated = await this.albumRepo.update(albumId, {
          url: parsed.canonicalUrl,
          name: row.nameLocked ? row.name : album.name,
          photoCount: photos.length,
          syncedAt: new Date(),
        });
        this.cache.delete(albumId);
        this.remember(albumId, updated.url, album);

        const coverSource = this.pickCoverPhoto(photos, updated.coverPhotoId);
        if (coverSource) {
          try {
            const cover = await this.saveCoverFromPhoto(albumId, coverSource);
            updated = await this.albumRepo.update(albumId, cover);
          } catch {
            /* ignore */
          }
        } else {
          await this.coverStore.remove(albumId);
          updated = await this.albumRepo.update(albumId, { coverPhotoId: null, coverMime: null });
        }
        return { ...this.toSummary(updated), photos };
      } catch (err) {
        if (err instanceof HttpError) throw err;
        const code = (err as { code?: string }).code;
        if (code === "P2002" || code === "ALBUM_EXISTS") {
          throw new HttpError(409, "this iCloud album is already linked", "ALBUM_EXISTS");
        }
        throw err;
      }
    }

    if (typeof body.name === "string") {
      const name = body.name.trim().slice(0, 200);
      if (!name) throw new HttpError(400, "name is required", "INVALID_NAME");
      const updated = await this.albumRepo.update(albumId, { name, nameLocked: true });
      const detail = await this.loadDetail(updated);
      return { ...detail, name: updated.name, nameLocked: true };
    }

    if (typeof body.coverPhotoId === "string" && body.coverPhotoId.trim()) {
      const detail = await this.loadDetail(row);
      if (detail.error) throw new HttpError(400, detail.error, "ICLOUD_FETCH_FAILED");
      const photo = detail.photos.find((p) => p.id === body.coverPhotoId);
      if (!photo) throw new HttpError(404, "photo not found", "NOT_FOUND");
      const cover = await this.saveCoverFromPhoto(albumId, photo);
      const updated = await this.albumRepo.update(albumId, cover);
      return { ...this.toSummary(updated), photos: detail.photos };
    }

    throw new HttpError(400, "nothing to update", "INVALID_BODY");
  }

  async remove(userId: number, albumId: number): Promise<IcloudAlbumsResponse> {
    const { row } = await this.requireAlbum(userId, albumId);
    await this.albumRepo.remove(albumId);
    this.cache.delete(albumId);
    await this.coverStore.remove(row.id);
    return this.list(userId);
  }

  async readCover(userId: number, albumId: number): Promise<{ bytes: Buffer; mime: string }> {
    await this.requireAlbum(userId, albumId);
    const file = await this.coverStore.read(albumId);
    if (!file) throw new HttpError(404, "cover not found", "NOT_FOUND");
    return file;
  }

  async downloadPhoto(
    userId: number,
    albumId: number,
    photoId: string,
  ): Promise<{ bytes: Buffer; mime: string; filename: string }> {
    const { row } = await this.requireAlbum(userId, albumId);
    const linked = await this.loadDetail(row);
    const photo = linked.photos.find((p) => p.id === photoId);
    if (!photo) throw new HttpError(404, "photo not found", "NOT_FOUND");
    const allowed = new Set([photo.fullUrl, photo.thumbUrl]);
    const source = allowed.has(photo.fullUrl) ? photo.fullUrl : photo.thumbUrl;
    const bytes = await this.fetchAllowedAsset(source, allowed);
    const mime = "image/jpeg";
    const base = (photo.caption || linked.name || "icloud").replace(/[^\w.-]+/g, "_").slice(0, 40);
    return { bytes, mime, filename: `${base || "icloud"}.jpg` };
  }

  private async fetchAllowedAsset(url: string, allowed: Set<string>): Promise<Buffer> {
    if (!allowed.has(url)) throw new HttpError(400, "invalid photo url", "INVALID_URL");
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new HttpError(400, "invalid photo url", "INVALID_URL");
    }
    if (parsed.protocol !== "https:") throw new HttpError(400, "invalid photo url", "INVALID_URL");
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), DOWNLOAD_MS);
    try {
      const response = await this.http(url, {
        method: "GET",
        headers: { "user-agent": "Photos/5.0", referer: "" },
        signal: ac.signal,
        redirect: "follow",
      });
      if (!response.ok) throw new HttpError(502, "could not download iCloud photo", "ICLOUD_FETCH_FAILED");
      const buf = Buffer.from(await response.arrayBuffer());
      if (buf.length > DOWNLOAD_MAX_BYTES) throw new HttpError(400, "image is too large", "TOO_LARGE");
      return buf;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(502, "could not download iCloud photo", "ICLOUD_FETCH_FAILED");
    } finally {
      clearTimeout(timer);
    }
  }
}
