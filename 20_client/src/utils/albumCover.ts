import type { IcloudAlbumPhoto } from "../api/photos";

function photoTime(photo: IcloudAlbumPhoto): number {
  if (!photo.date) return Number.POSITIVE_INFINITY;
  const t = Date.parse(photo.date);
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

function comparePhotoTime(a: IcloudAlbumPhoto, b: IcloudAlbumPhoto): number {
  const ta = photoTime(a);
  const tb = photoTime(b);
  const aMissing = !Number.isFinite(ta);
  const bMissing = !Number.isFinite(tb);
  if (aMissing && bMissing) return a.id.localeCompare(b.id);
  if (aMissing) return 1;
  if (bMissing) return -1;
  if (ta !== tb) return ta - tb;
  return a.id.localeCompare(b.id);
}

/** Oldest photo first — the first one registered in the shared album. */
export function sortAlbumPhotosOldestFirst(photos: IcloudAlbumPhoto[]): IcloudAlbumPhoto[] {
  return [...photos].sort(comparePhotoTime);
}

export function albumCoverPhoto(photos: IcloudAlbumPhoto[]): IcloudAlbumPhoto | null {
  const sorted = sortAlbumPhotosOldestFirst(photos);
  return sorted[0] ?? null;
}
