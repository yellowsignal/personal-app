import type { AuthRepository } from "../domain/authRepository.js";
import { HttpError } from "./authService.js";
import {
  fetchIcloudSharedAlbum,
  parseIcloudSharedAlbumUrl,
  IcloudAlbumError,
  type FetchLike,
  type IcloudAlbum,
  type IcloudAlbumPhoto,
} from "./icloudSharedAlbum.js";

export interface IcloudAlbumResponse {
  configured: boolean;
  url: string | null;
  name: string | null;
  photos: IcloudAlbumPhoto[];
  error?: string;
}

const CACHE_TTL_MS = 45_000;

export class IcloudSharedAlbumService {
  private readonly cache = new Map<number, { url: string; at: number; album: IcloudAlbum }>();

  constructor(
    private readonly authRepo: AuthRepository,
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

  private remember(familyId: number, url: string, album: IcloudAlbum): void {
    this.cache.set(familyId, { url, at: Date.now(), album });
  }

  async get(userId: number): Promise<IcloudAlbumResponse> {
    const { family } = await this.requireFamily(userId);
    const url = family.icloudSharedAlbumUrl;
    if (!url) return { configured: false, url: null, name: null, photos: [] };

    const hit = this.cache.get(family.id);
    if (hit && hit.url === url && Date.now() - hit.at < CACHE_TTL_MS) {
      return { configured: true, url, name: hit.album.name, photos: hit.album.photos };
    }

    try {
      const album = await fetchIcloudSharedAlbum(url, { http: this.http });
      this.remember(family.id, url, album);
      return { configured: true, url, name: album.name, photos: album.photos };
    } catch (err) {
      const message = err instanceof IcloudAlbumError ? err.message : "could not load iCloud album";
      return { configured: true, url, name: null, photos: [], error: message };
    }
  }

  async set(userId: number, rawUrl: unknown): Promise<IcloudAlbumResponse> {
    const { family } = await this.requireFamily(userId);
    if (rawUrl === null || (typeof rawUrl === "string" && !rawUrl.trim())) {
      return this.clear(userId);
    }
    const parsed = parseIcloudSharedAlbumUrl(rawUrl);
    if (!parsed) throw new HttpError(400, "invalid iCloud shared album URL", "INVALID_URL");
    try {
      const album = await fetchIcloudSharedAlbum(parsed.canonicalUrl, { http: this.http });
      await this.authRepo.updateFamilyIcloudSharedAlbumUrl(family.id, parsed.canonicalUrl);
      this.remember(family.id, parsed.canonicalUrl, album);
      return {
        configured: true,
        url: parsed.canonicalUrl,
        name: album.name,
        photos: album.photos,
      };
    } catch {
      throw new HttpError(400, "could not open iCloud album", "ICLOUD_FETCH_FAILED");
    }
  }

  async clear(userId: number): Promise<IcloudAlbumResponse> {
    const { family } = await this.requireFamily(userId);
    await this.authRepo.updateFamilyIcloudSharedAlbumUrl(family.id, null);
    this.cache.delete(family.id);
    return { configured: false, url: null, name: null, photos: [] };
  }
}
