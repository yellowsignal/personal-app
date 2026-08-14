import type { AuthRepository } from "../domain/authRepository.js";
import type { FamilyIcloudAlbumRepository } from "../domain/familyIcloudAlbumRepository.js";
import { HttpError } from "./authService.js";
import {
  fetchIcloudSharedAlbum,
  parseIcloudSharedAlbumUrl,
  IcloudAlbumError,
  type FetchLike,
  type IcloudAlbum,
  type IcloudAlbumPhoto,
} from "./icloudSharedAlbum.js";

export const MAX_FAMILY_ICLOUD_ALBUMS = 8;
const CACHE_TTL_MS = 45_000;
const DOWNLOAD_MAX_BYTES = 20 * 1024 * 1024;
const DOWNLOAD_MS = 20_000;

export interface LinkedIcloudAlbum {
  id: number;
  url: string;
  name: string | null;
  photos: IcloudAlbumPhoto[];
  error?: string;
}

export interface IcloudAlbumsResponse {
  albums: LinkedIcloudAlbum[];
}

export class IcloudSharedAlbumService {
  private readonly cache = new Map<number, { url: string; at: number; album: IcloudAlbum }>();

  constructor(
    private readonly authRepo: AuthRepository,
    private readonly albumRepo: FamilyIcloudAlbumRepository,
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

  private async loadPhotos(row: { id: number; url: string; name: string | null }): Promise<LinkedIcloudAlbum> {
    const hit = this.cache.get(row.id);
    if (hit && hit.url === row.url && Date.now() - hit.at < CACHE_TTL_MS) {
      return { id: row.id, url: row.url, name: hit.album.name, photos: hit.album.photos };
    }
    try {
      const album = await fetchIcloudSharedAlbum(row.url, { http: this.http });
      this.remember(row.id, row.url, album);
      if (album.name && album.name !== row.name) {
        await this.albumRepo.updateName(row.id, album.name).catch(() => undefined);
      }
      return { id: row.id, url: row.url, name: album.name, photos: album.photos };
    } catch (err) {
      const message = err instanceof IcloudAlbumError ? err.message : "could not load iCloud album";
      return { id: row.id, url: row.url, name: row.name, photos: [], error: message };
    }
  }

  async list(userId: number): Promise<IcloudAlbumsResponse> {
    const { family } = await this.requireFamily(userId);
    const rows = await this.albumRepo.listByFamily(family.id);
    const albums = await Promise.all(rows.map((row) => this.loadPhotos(row)));
    return { albums };
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
    try {
      const album = await fetchIcloudSharedAlbum(parsed.canonicalUrl, { http: this.http });
      const row = await this.albumRepo.create({
        familyId: family.id,
        url: parsed.canonicalUrl,
        name: album.name,
      });
      this.remember(row.id, row.url, album);
      return { id: row.id, url: row.url, name: album.name, photos: album.photos };
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(400, "could not open iCloud album", "ICLOUD_FETCH_FAILED");
    }
  }

  async update(userId: number, albumId: number, rawUrl: unknown): Promise<LinkedIcloudAlbum> {
    const { family } = await this.requireFamily(userId);
    const row = await this.albumRepo.findById(albumId);
    if (!row || row.familyId !== family.id) throw new HttpError(404, "album not found", "NOT_FOUND");
    const parsed = parseIcloudSharedAlbumUrl(rawUrl);
    if (!parsed) throw new HttpError(400, "invalid iCloud shared album URL", "INVALID_URL");
    const siblings = await this.albumRepo.listByFamily(family.id);
    if (siblings.some((item) => item.id !== albumId && item.url === parsed.canonicalUrl)) {
      throw new HttpError(409, "this iCloud album is already linked", "ALBUM_EXISTS");
    }
    try {
      const album = await fetchIcloudSharedAlbum(parsed.canonicalUrl, { http: this.http });
      const updated = await this.albumRepo.update(albumId, {
        url: parsed.canonicalUrl,
        name: album.name,
      });
      this.cache.delete(albumId);
      this.remember(updated.id, updated.url, album);
      return { id: updated.id, url: updated.url, name: album.name, photos: album.photos };
    } catch (err) {
      if (err instanceof HttpError) throw err;
      const code = (err as { code?: string }).code;
      if (code === "P2002" || code === "ALBUM_EXISTS") {
        throw new HttpError(409, "this iCloud album is already linked", "ALBUM_EXISTS");
      }
      throw new HttpError(400, "could not open iCloud album", "ICLOUD_FETCH_FAILED");
    }
  }

  async remove(userId: number, albumId: number): Promise<IcloudAlbumsResponse> {
    const { family } = await this.requireFamily(userId);
    const row = await this.albumRepo.findById(albumId);
    if (!row || row.familyId !== family.id) throw new HttpError(404, "album not found", "NOT_FOUND");
    await this.albumRepo.remove(albumId);
    this.cache.delete(albumId);
    return this.list(userId);
  }

  async downloadPhoto(
    userId: number,
    albumId: number,
    photoId: string,
  ): Promise<{ bytes: Buffer; mime: string; filename: string }> {
    const { family } = await this.requireFamily(userId);
    const row = await this.albumRepo.findById(albumId);
    if (!row || row.familyId !== family.id) throw new HttpError(404, "album not found", "NOT_FOUND");
    const linked = await this.loadPhotos(row);
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
