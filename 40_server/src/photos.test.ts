import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "./app.js";
import { MemoryAuthRepository } from "./domain/memoryAuthRepository.js";
import { MemoryFamilyActivityRepository } from "./domain/memoryFamilyActivityRepository.js";
import { MemoryPhotoRepository } from "./domain/memoryPhotoRepository.js";
import { TaskStore } from "./store.js";
import { PhotoStore, sniffPhotoMime } from "./storage/photoStore.js";
import { albumCoverFileUrl } from "./services/icloudSharedAlbumService.js";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const JPEG_1X1 = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//Z",
  "base64",
);

function tmpStore(): TaskStore {
  const dir = mkdtempSync(join(tmpdir(), "personal-app-"));
  return new TaskStore(join(dir, "tasks.json"));
}

function tmpPhotoStore(): PhotoStore {
  const dir = mkdtempSync(join(tmpdir(), "personal-app-photos-"));
  return new PhotoStore(dir);
}

async function listen(app: ReturnType<typeof createApp>) {
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected TCP address");
  }
  return { server, base: `http://127.0.0.1:${address.port}` };
}

async function registerOwner(base: string) {
  const res = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "owner@example.com",
      password: "password123",
      name: "민호",
      familyName: "최가네",
    }),
  });
  assert.equal(res.status, 201);
  return (await res.json()) as { token: string; user: { id: number } };
}

function photoApp() {
  return createApp(tmpStore(), {
    authRepo: new MemoryAuthRepository(),
    photoRepo: new MemoryPhotoRepository(),
    photoStore: tmpPhotoStore(),
    activityRepo: new MemoryFamilyActivityRepository(),
    jwtSecret: "test-secret",
  });
}

test("sniffPhotoMime reads jpeg/png when content-type is missing", () => {
  assert.equal(sniffPhotoMime(PNG_1X1), "image/png");
  assert.equal(sniffPhotoMime(JPEG_1X1, "application/octet-stream"), "image/jpeg");
  assert.equal(sniffPhotoMime(PNG_1X1, "image/png"), "image/png");
  assert.equal(sniffPhotoMime(Buffer.from("not-an-image")), null);
});

test("albumCoverFileUrl changes when the chosen cover photo changes", () => {
  assert.equal(albumCoverFileUrl(3, null, "guid-1"), null);
  assert.equal(albumCoverFileUrl(3, "image/jpeg", null), "/api/photos/icloud-albums/3/cover");
  assert.equal(
    albumCoverFileUrl(3, "image/jpeg", "guid-old"),
    "/api/photos/icloud-albums/3/cover?v=guid-old",
  );
  assert.notEqual(
    albumCoverFileUrl(3, "image/jpeg", "guid-old"),
    albumCoverFileUrl(3, "image/jpeg", "guid-1"),
  );
});

test("photos create is always family-shared; members can view, only owner deletes", async () => {
  const app = photoApp();
  const { server, base } = await listen(app);
  try {
    const owner = await registerOwner(base);
    const ownerFamily = (await fetch(`${base}/api/family`, {
      headers: { authorization: `Bearer ${owner.token}` },
    }).then((r) => r.json())) as { inviteCode: string };

    const created = await fetch(`${base}/api/photos?caption=${encodeURIComponent("가족")}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${owner.token}`,
        "content-type": "image/png",
      },
      body: PNG_1X1,
    });
    assert.equal(created.status, 201);
    const photo = (await created.json()) as {
      id: number;
      caption: string;
      isShared: boolean;
      fileUrl: string;
      editable: boolean;
    };
    assert.equal(photo.caption, "가족");
    assert.equal(photo.isShared, true);
    assert.equal(photo.editable, true);

    const listed = await fetch(`${base}/api/photos`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(listed.status, 200);
    const items = (await listed.json()) as Array<{ caption: string; isShared: boolean }>;
    assert.equal(items.length, 1);
    assert.equal(items[0].caption, "가족");
    assert.equal(items[0].isShared, true);

    const fileRes = await fetch(`${base}${photo.fileUrl}`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(fileRes.status, 200);
    assert.equal(fileRes.headers.get("content-type"), "image/png");
    const fileBytes = Buffer.from(await fileRes.arrayBuffer());
    assert.deepEqual(fileBytes, PNG_1X1);

    const memberReg = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "member@example.com",
        password: "password123",
        name: "Member",
        inviteCode: ownerFamily.inviteCode,
      }),
    });
    assert.equal(memberReg.status, 201);
    const member = (await memberReg.json()) as { token: string };

    const memberList = await fetch(`${base}/api/photos`, {
      headers: { authorization: `Bearer ${member.token}` },
    });
    assert.equal(memberList.status, 200);
    const memberItems = (await memberList.json()) as Array<{
      id: number;
      caption: string;
      editable: boolean;
    }>;
    assert.equal(memberItems.length, 1);
    assert.equal(memberItems[0].caption, "가족");
    assert.equal(memberItems[0].editable, false);

    const memberFile = await fetch(`${base}/api/photos/${photo.id}/file`, {
      headers: { authorization: `Bearer ${member.token}` },
    });
    assert.equal(memberFile.status, 200);

    const memberDelete = await fetch(`${base}/api/photos/${photo.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${member.token}` },
    });
    assert.equal(memberDelete.status, 403);

    const ownerDelete = await fetch(`${base}/api/photos/${photo.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(ownerDelete.status, 204);

    const afterDelete = await fetch(`${base}/api/photos`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    const afterItems = (await afterDelete.json()) as unknown[];
    assert.equal(afterItems.length, 0);
  } finally {
    server.close();
  }
});

test("photos reject non-image and shared create still succeeds if activity would fail", async () => {
  const activityRepo = new MemoryFamilyActivityRepository();
  activityRepo.create = async () => {
    throw new Error("activity insert failed");
  };
  const app = createApp(tmpStore(), {
    authRepo: new MemoryAuthRepository(),
    photoRepo: new MemoryPhotoRepository(),
    photoStore: tmpPhotoStore(),
    activityRepo,
    jwtSecret: "test-secret",
  });
  const { server, base } = await listen(app);
  try {
    const owner = await registerOwner(base);

    const bad = await fetch(`${base}/api/photos`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${owner.token}`,
        "content-type": "text/plain",
      },
      body: Buffer.from("hello"),
    });
    assert.equal(bad.status, 400);

    const shared = await fetch(`${base}/api/photos?caption=ok&isShared=true`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${owner.token}`,
        "content-type": "image/png",
      },
      body: PNG_1X1,
    });
    assert.equal(shared.status, 201);
    const body = (await shared.json()) as { id: number; isShared: boolean };
    assert.equal(body.isShared, true);
    assert.ok(body.id > 0);
  } finally {
    server.close();
  }
});

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function mockLegacyIcloudFetch(): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET" && url.includes("cvws.icloud-content.com")) {
      return new Response(JPEG_1X1, { status: 200, headers: { "content-type": "image/jpeg" } });
    }
    const name = url.includes("B0abcDEF12_34") ? "일상" : "가족 여행";
    if (url.includes("/webstream") && !url.includes("p12-sharedstreams")) {
      return jsonResponse(330, { "X-Apple-MMe-Host": "p12-sharedstreams.icloud.com" });
    }
    if (url.endsWith("/webstream")) {
      return jsonResponse(200, {
        streamName: name,
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
            photoGuid: "guid-old",
            caption: "예전",
            dateCreated: "2025-01-01T00:00:00Z",
            derivatives: {
              "640": { checksum: "thumb-1", fileSize: 10 },
              "2048": { checksum: "full-1", fileSize: 80 },
            },
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
  }) as typeof fetch;
}

test("icloud albums can link several URLs, download without storing, and unlink one", async () => {
  const app = createApp(tmpStore(), {
    authRepo: new MemoryAuthRepository(),
    photoRepo: new MemoryPhotoRepository(),
    photoStore: tmpPhotoStore(),
    activityRepo: new MemoryFamilyActivityRepository(),
    jwtSecret: "test-secret",
    icloudFetch: mockLegacyIcloudFetch(),
  });
  const { server, base } = await listen(app);
  try {
    const owner = await registerOwner(base);
    const headers = { authorization: `Bearer ${owner.token}`, "content-type": "application/json" };

    const empty = await fetch(`${base}/api/photos/icloud-albums`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(empty.status, 200);
    const emptyBody = (await empty.json()) as { albums: unknown[] };
    assert.equal(emptyBody.albums.length, 0);

    const bad = await fetch(`${base}/api/photos/icloud-albums`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: "https://example.com/nope" }),
    });
    assert.equal(bad.status, 400);

    const first = await fetch(`${base}/api/photos/icloud-albums`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: "https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC" }),
    });
    assert.equal(first.status, 201);
    const firstBody = (await first.json()) as {
      id: number;
      name: string;
      coverUrl: string | null;
      coverPhotoId: string | null;
      photos: Array<{ id: string; fullUrl: string }>;
    };
    assert.equal(firstBody.name, "가족 여행");
    assert.equal(firstBody.photos.length, 2);
    assert.equal(firstBody.photos[0].id, "guid-old");
    assert.equal(firstBody.photos[1].id, "guid-1");
    assert.equal(firstBody.coverPhotoId, "guid-old");
    assert.equal(firstBody.coverUrl, `/api/photos/icloud-albums/${firstBody.id}/cover?v=guid-old`);
    assert.ok(firstBody.coverUrl);

    const coverRes = await fetch(`${base}${firstBody.coverUrl}`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(coverRes.status, 200);
    assert.equal(coverRes.headers.get("content-type"), "image/jpeg");

    const dup = await fetch(`${base}/api/photos/icloud-albums`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: "https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC" }),
    });
    assert.equal(dup.status, 409);

    const second = await fetch(`${base}/api/photos/icloud-albums`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: "https://www.icloud.com/sharedalbum/#B0abcDEF12_34" }),
    });
    assert.equal(second.status, 201);
    const secondBody = (await second.json()) as { id: number; name: string };
    assert.equal(secondBody.name, "일상");
    assert.notEqual(secondBody.id, firstBody.id);

    const listed = await fetch(`${base}/api/photos/icloud-albums`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    const listedBody = (await listed.json()) as {
      albums: Array<{
        id: number;
        name: string | null;
        photoCount: number | null;
        coverUrl: string | null;
        photos?: unknown;
      }>;
    };
    assert.equal(listedBody.albums.length, 2);
    const travel = listedBody.albums.find((a) => a.id === firstBody.id);
    assert.equal(travel?.photoCount, 2);
    assert.ok(travel?.coverUrl);
    assert.equal(travel?.photos, undefined);

    const detail = await fetch(`${base}/api/photos/icloud-albums/${firstBody.id}`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(detail.status, 200);
    const detailBody = (await detail.json()) as { photos: Array<{ id: string }>; photoCount: number };
    assert.equal(detailBody.photos[0]?.id, "guid-old");
    assert.equal(detailBody.photoCount, 2);

    const renamed = await fetch(`${base}/api/photos/icloud-albums/${firstBody.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ name: "우리 여행" }),
    });
    assert.equal(renamed.status, 200);
    const renamedBody = (await renamed.json()) as { name: string; nameLocked: boolean };
    assert.equal(renamedBody.name, "우리 여행");
    assert.equal(renamedBody.nameLocked, true);

    const coverChanged = await fetch(`${base}/api/photos/icloud-albums/${firstBody.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ coverPhotoId: "guid-1" }),
    });
    assert.equal(coverChanged.status, 200);
    const coverChangedBody = (await coverChanged.json()) as { coverPhotoId: string; coverUrl: string };
    assert.equal(coverChangedBody.coverPhotoId, "guid-1");
    assert.equal(coverChangedBody.coverUrl, `/api/photos/icloud-albums/${firstBody.id}/cover?v=guid-1`);
    assert.notEqual(coverChangedBody.coverUrl, firstBody.coverUrl);
    const newCoverRes = await fetch(`${base}${coverChangedBody.coverUrl}`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(newCoverRes.status, 200);
    assert.equal(newCoverRes.headers.get("content-type"), "image/jpeg");

    const clash = await fetch(`${base}/api/photos/icloud-albums/${firstBody.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ url: "https://www.icloud.com/sharedalbum/#B0abcDEF12_34" }),
    });
    assert.equal(clash.status, 409);

    const fileRes = await fetch(
      `${base}/api/photos/icloud-albums/${firstBody.id}/file?photo=guid-1`,
      { headers: { authorization: `Bearer ${owner.token}` } },
    );
    assert.equal(fileRes.status, 200);
    assert.equal(fileRes.headers.get("content-type"), "image/jpeg");
    const fileBytes = Buffer.from(await fileRes.arrayBuffer());
    assert.deepEqual(fileBytes, JPEG_1X1);

    const cleared = await fetch(`${base}/api/photos/icloud-albums/${firstBody.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(cleared.status, 200);
    const clearedBody = (await cleared.json()) as { albums: Array<{ id: number }> };
    assert.equal(clearedBody.albums.length, 1);
    assert.equal(clearedBody.albums[0].id, secondBody.id);

    const patched = await fetch(`${base}/api/photos/icloud-albums/${secondBody.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ url: "https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC" }),
    });
    assert.equal(patched.status, 200);
    const patchedBody = (await patched.json()) as { id: number; name: string; url: string };
    assert.equal(patchedBody.id, secondBody.id);
    assert.equal(patchedBody.name, "가족 여행");
    assert.equal(patchedBody.url, "https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC");
  } finally {
    server.close();
  }
});

test("icloud album POST does not save when Apple fetch fails", async () => {
  const app = createApp(tmpStore(), {
    authRepo: new MemoryAuthRepository(),
    photoRepo: new MemoryPhotoRepository(),
    photoStore: tmpPhotoStore(),
    jwtSecret: "test-secret",
    icloudFetch: (async () => new Response("nope", { status: 500 })) as typeof fetch,
  });
  const { server, base } = await listen(app);
  try {
    const owner = await registerOwner(base);
    const saved = await fetch(`${base}/api/photos/icloud-albums`, {
      method: "POST",
      headers: { authorization: `Bearer ${owner.token}`, "content-type": "application/json" },
      body: JSON.stringify({ url: "https://www.icloud.com/sharedalbum/#B125ON9t3mbLNC" }),
    });
    assert.equal(saved.status, 400);
    const listed = await fetch(`${base}/api/photos/icloud-albums`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    const listedBody = (await listed.json()) as { albums: unknown[] };
    assert.equal(listedBody.albums.length, 0);
  } finally {
    server.close();
  }
});

test("icloud album POST returns ICLOUD_NOT_FOUND when Apple responds 404", async () => {
  const app = createApp(tmpStore(), {
    authRepo: new MemoryAuthRepository(),
    photoRepo: new MemoryPhotoRepository(),
    photoStore: tmpPhotoStore(),
    jwtSecret: "test-secret",
    icloudFetch: (async () => new Response("", { status: 404 })) as typeof fetch,
  });
  const { server, base } = await listen(app);
  try {
    const owner = await registerOwner(base);
    const saved = await fetch(`${base}/api/photos/icloud-albums`, {
      method: "POST",
      headers: { authorization: `Bearer ${owner.token}`, "content-type": "application/json" },
      body: JSON.stringify({ url: "https://www.icloud.com/sharedalbum/#B2cJtdOXmGRtmE5" }),
    });
    assert.equal(saved.status, 400);
    const body = (await saved.json()) as { code?: string };
    assert.equal(body.code, "ICLOUD_NOT_FOUND");
  } finally {
    server.close();
  }
});
