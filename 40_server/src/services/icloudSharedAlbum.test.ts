import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchIcloudSharedAlbum,
  getLegacyPartition,
  parseIcloudSharedAlbumUrl,
  sortIcloudPhotosOldestFirst,
  type FetchLike,
} from "./icloudSharedAlbum.js";

test("parseIcloudSharedAlbumUrl accepts legacy hash links and CloudKit path links", () => {
  const legacy = parseIcloudSharedAlbumUrl("https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC");
  assert.deepEqual(legacy, {
    kind: "legacy",
    token: "B125ON9t3mbLNC",
    canonicalUrl: "https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC",
  });

  const localized = parseIcloudSharedAlbumUrl("https://www.icloud.com/sharedalbum/ko-kr/#B0abcDEF12_34");
  assert.equal(localized?.kind, "legacy");
  assert.equal(localized?.token, "B0abcDEF12_34");

  const bare = parseIcloudSharedAlbumUrl("www.icloud.com/sharedalbum/#B125ON9t3mbLNC");
  assert.equal(bare?.canonicalUrl, "https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC");

  const ck = parseIcloudSharedAlbumUrl("https://photos.icloud.com/shared/album/A1b2C3d4E5f6?x=1");
  assert.deepEqual(ck, {
    kind: "cloudkit",
    token: "A1b2C3d4E5f6",
    canonicalUrl: "https://photos.icloud.com/shared/album/A1b2C3d4E5f6",
  });

  assert.equal(parseIcloudSharedAlbumUrl("https://example.com/sharedalbum/#B125ON9t3mbLNC"), null);
  assert.equal(parseIcloudSharedAlbumUrl("not-a-url"), null);
  assert.equal(parseIcloudSharedAlbumUrl("https://www.icloud.com/sharedalbum/#xx"), null);
});

test("getLegacyPartition pads single-digit partitions", () => {
  assert.equal(getLegacyPartition("B125ON9t3mbLNC").length >= 2, true);
});

test("sortIcloudPhotosOldestFirst keeps undated photos last and sorts ids stably", () => {
  const sorted = sortIcloudPhotosOldestFirst([
    { id: "b", caption: null, date: null, thumbUrl: "/b", fullUrl: "/b" },
    { id: "a", caption: null, date: null, thumbUrl: "/a", fullUrl: "/a" },
    { id: "old", caption: null, date: "2020-01-01T00:00:00Z", thumbUrl: "/o", fullUrl: "/o" },
  ]);
  assert.deepEqual(
    sorted.map((p) => p.id),
    ["old", "a", "b"],
  );
});

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("fetchIcloudSharedAlbum follows 330 redirect and maps asset URLs", async () => {
  const token = "B125ON9t3mbLNC";
  const calls: string[] = [];
  const http: FetchLike = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/webstream") && url.includes("p12-sharedstreams") === false) {
      return jsonResponse(330, { "X-Apple-MMe-Host": "p12-sharedstreams.icloud.com" });
    }
    if (url.endsWith("/webstream")) {
      return jsonResponse(200, {
        streamName: "가족 여행",
        photos: [
          {
            photoGuid: "guid-1",
            caption: "바다",
            dateCreated: "2026-08-01T00:00:00Z",
            derivatives: {
              "640": { checksum: "thumb-1", fileSize: 10 },
              "2048": { checksum: "full-1", fileSize: 80 },
            },
          },
          {
            photoGuid: "guid-2",
            caption: "예전",
            dateCreated: "2025-01-01T00:00:00Z",
            derivatives: {
              "640": { checksum: "thumb-1", fileSize: 10 },
              "2048": { checksum: "full-1", fileSize: 80 },
            },
          },
          {
            photoGuid: "guid-vid",
            mediaAssetType: "video",
            derivatives: { PosterFrame: { checksum: "poster", fileSize: 1 } },
          },
        ],
      });
    }
    if (url.endsWith("/webasseturls")) {
      return jsonResponse(200, {
        items: {
          "thumb-1": { url_location: "cvws.icloud-content.com", url_path: "/t/thumb.jpg?a=1" },
          "full-1": { url_location: "cvws.icloud-content.com", url_path: "/t/full.jpg?a=1" },
        },
      });
    }
    return jsonResponse(404, {});
  };

  const album = await fetchIcloudSharedAlbum(`https://www.icloud.com/sharedalbum/#${token}`, { http });
  assert.equal(album.name, "가족 여행");
  assert.equal(album.photos.length, 2);
  assert.equal(album.photos[0].id, "guid-2");
  assert.equal(album.photos[1].id, "guid-1");
  assert.equal(album.photos[0].caption, "예전");
  assert.equal(album.photos[1].caption, "바다");
  assert.equal(album.photos[0].thumbUrl, "https://cvws.icloud-content.com/t/thumb.jpg?a=1");
  assert.equal(album.photos[0].fullUrl, "https://cvws.icloud-content.com/t/full.jpg?a=1");
  assert.equal(calls.some((u) => u.includes("p12-sharedstreams.icloud.com") && u.endsWith("/webstream")), true);
  assert.equal(calls.some((u) => u.endsWith("/webasseturls")), true);
});

test("fetchIcloudSharedAlbum CloudKit resolve + query maps download URLs", async () => {
  const http: FetchLike = async (input) => {
    const url = String(input);
    if (url.includes("/records/resolve")) {
      return jsonResponse(200, {
        results: [
          {
            zoneID: { zoneName: "Shared-1", ownerRecordName: "owner", zoneType: "REGULAR_CUSTOM_ZONE" },
            anonymousPublicAccess: {
              token: "anon-token",
              databasePartition: "p117-ckdatabasews.icloud.com:443",
            },
            share: { fields: { "cloudkit.title": { value: "우리 앨범" } } },
          },
        ],
      });
    }
    if (url.includes("/records/query")) {
      assert.equal(url.includes("publicAccessAuthToken=anon-token"), true);
      assert.equal(url.startsWith("https://p117-ckdatabasews.icloud.com/"), true);
      return jsonResponse(200, {
        records: [
          {
            recordName: "master-1",
            recordType: "CPLMaster",
            fields: {
              resJPEGMedRes: { value: { downloadURL: "https://cdn.example/med.jpg" } },
              resJPEGMedWidth: { value: 800 },
              resJPEGFullRes: { value: { downloadURL: "https://cdn.example/full.jpg" } },
              resJPEGFullWidth: { value: 2048 },
            },
          },
          {
            recordName: "movie-1",
            recordType: "CPLMaster",
            fields: {
              itemType: { value: "public.mpeg-4" },
              resVidMedRes: { value: { downloadURL: "https://cdn.example/vid.mp4" } },
            },
          },
        ],
      });
    }
    return jsonResponse(404, {});
  };

  const album = await fetchIcloudSharedAlbum("https://photos.icloud.com/shared/album/A1b2C3d4E5f6", { http });
  assert.equal(album.name, "우리 앨범");
  assert.equal(album.photos.length, 1);
  assert.equal(album.photos[0].thumbUrl, "https://cdn.example/med.jpg");
  assert.equal(album.photos[0].fullUrl, "https://cdn.example/full.jpg");
});
