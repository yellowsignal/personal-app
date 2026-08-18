import assert from "node:assert/strict";
import { test } from "node:test";
import { albumCoverPhoto, sortAlbumPhotosOldestFirst, withAlbumCoverCacheKey } from "./albumCover";
import type { IcloudAlbumPhoto } from "../api/photos";

function photo(id: string, date: string | null): IcloudAlbumPhoto {
  return { id, caption: id, date, thumbUrl: `/${id}.jpg`, fullUrl: `/${id}.jpg` };
}

test("albumCoverPhoto uses the earliest registered photo", () => {
  const cover = albumCoverPhoto([
    photo("new", "2026-08-10T00:00:00Z"),
    photo("old", "2026-01-02T00:00:00Z"),
    photo("mid", "2026-04-01T00:00:00Z"),
  ]);
  assert.equal(cover?.id, "old");
});

test("albumCoverPhoto falls back to a stable id when dates are missing", () => {
  const cover = albumCoverPhoto([photo("b", null), photo("a", null)]);
  assert.equal(cover?.id, "a");
});

test("sortAlbumPhotosOldestFirst keeps dated photos before undated ones", () => {
  const sorted = sortAlbumPhotosOldestFirst([
    photo("undated", null),
    photo("first", "2025-12-01T00:00:00Z"),
    photo("second", "2026-01-01T00:00:00Z"),
  ]);
  assert.deepEqual(
    sorted.map((p) => p.id),
    ["first", "second", "undated"],
  );
});

test("withAlbumCoverCacheKey changes the URL when the cover photo changes", () => {
  const first = withAlbumCoverCacheKey("/api/photos/icloud-albums/3/cover", "guid-old");
  const next = withAlbumCoverCacheKey("/api/photos/icloud-albums/3/cover", "guid-1");
  assert.equal(first, "/api/photos/icloud-albums/3/cover?v=guid-old");
  assert.equal(next, "/api/photos/icloud-albums/3/cover?v=guid-1");
  assert.equal(
    withAlbumCoverCacheKey("/api/photos/icloud-albums/3/cover?v=guid-old", "guid-1"),
    "/api/photos/icloud-albums/3/cover?v=guid-1",
  );
  assert.equal(withAlbumCoverCacheKey(null, "guid-1"), null);
});
