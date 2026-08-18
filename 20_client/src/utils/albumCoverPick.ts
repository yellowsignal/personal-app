import type { LinkedIcloudAlbum } from "../api/photos";

/** Same album already open — keep its photos. Opening another album needs a fetch. */
export function shouldReloadAlbumToPickCover(
  openAlbumId: number | null,
  targetAlbumId: number,
): boolean {
  return openAlbumId !== targetAlbumId;
}

/** PATCH cover/rename can omit photos; never drop the grid the user is looking at. */
export function mergeAlbumDetailPhotos(
  prev: LinkedIcloudAlbum | null,
  updated: LinkedIcloudAlbum,
): LinkedIcloudAlbum {
  if (updated.photos.length > 0) return updated;
  if (prev?.id === updated.id && prev.photos.length > 0) {
    return { ...updated, photos: prev.photos };
  }
  return updated;
}
