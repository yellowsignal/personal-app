import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeAlbumDetailPhotos, shouldReloadAlbumToPickCover } from "./albumCoverPick.ts";
import type { LinkedIcloudAlbum } from "../api/photos.ts";

function album(partial: Partial<LinkedIcloudAlbum> & Pick<LinkedIcloudAlbum, "id">): LinkedIcloudAlbum {
  return {
    url: "https://www.icloud.com/sharedalbum/#x",
    name: "えいと",
    nameLocked: false,
    photoCount: 115,
    coverPhotoId: "c1",
    coverUrl: "/cover",
    syncedAt: null,
    photos: [],
    ...partial,
  };
}

test("shouldReloadAlbumToPickCover is false when that album is already open", () => {
  assert.equal(shouldReloadAlbumToPickCover(7, 7), false);
  assert.equal(shouldReloadAlbumToPickCover(null, 7), true);
  assert.equal(shouldReloadAlbumToPickCover(3, 7), true);
});

test("mergeAlbumDetailPhotos keeps the open grid if the update comes back with no photos", () => {
  const prev = album({
    id: 7,
    photos: [
      { id: "a", caption: null, date: null, thumbUrl: "/a", fullUrl: "/a" },
      { id: "b", caption: null, date: null, thumbUrl: "/b", fullUrl: "/b" },
    ],
  });
  const updated = album({ id: 7, coverPhotoId: "b", photos: [] });
  const merged = mergeAlbumDetailPhotos(prev, updated);
  assert.equal(merged.coverPhotoId, "b");
  assert.equal(merged.photos.length, 2);
  assert.equal(merged.photos[1]?.id, "b");
});

test("cover pick from ⋯ must not replace an open album with a summary that has photos: []", () => {
  const openPhotos = [
    { id: "a", caption: null, date: null, thumbUrl: "/a", fullUrl: "/a" },
    { id: "b", caption: null, date: null, thumbUrl: "/b", fullUrl: "/b" },
  ];
  const open = album({ id: 7, photos: openPhotos });
  const menuSummary = album({ id: 7, photos: [] });
  assert.equal(shouldReloadAlbumToPickCover(open.id, menuSummary.id), false);
  const wiped = { ...menuSummary, photos: [] };
  assert.equal(wiped.photos.length, 0);
  assert.equal(open.photos.length, 2);
});

test("mergeAlbumDetailPhotos uses server photos when they are present", () => {
  const prev = album({
    id: 7,
    photos: [{ id: "old", caption: null, date: null, thumbUrl: "/o", fullUrl: "/o" }],
  });
  const updated = album({
    id: 7,
    photos: [{ id: "new", caption: null, date: null, thumbUrl: "/n", fullUrl: "/n" }],
  });
  assert.equal(mergeAlbumDetailPhotos(prev, updated).photos[0]?.id, "new");
});
