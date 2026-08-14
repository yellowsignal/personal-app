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

test("photos create/list/file/delete and personal vs family scope", async () => {
  const app = photoApp();
  const { server, base } = await listen(app);
  try {
    const owner = await registerOwner(base);
    const ownerFamily = (await fetch(`${base}/api/family`, {
      headers: { authorization: `Bearer ${owner.token}` },
    }).then((r) => r.json())) as { inviteCode: string };

    const privateRes = await fetch(`${base}/api/photos?caption=${encodeURIComponent("개인")}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${owner.token}`,
        "content-type": "image/png",
      },
      body: PNG_1X1,
    });
    assert.equal(privateRes.status, 201);
    const privatePhoto = (await privateRes.json()) as {
      id: number;
      caption: string;
      isShared: boolean;
      fileUrl: string;
      editable: boolean;
    };
    assert.equal(privatePhoto.caption, "개인");
    assert.equal(privatePhoto.isShared, false);
    assert.equal(privatePhoto.editable, true);

    const sharedRes = await fetch(
      `${base}/api/photos?caption=${encodeURIComponent("가족")}&isShared=true`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${owner.token}`,
          "content-type": "application/octet-stream",
        },
        body: JPEG_1X1,
      },
    );
    assert.equal(sharedRes.status, 201);
    const sharedPhoto = (await sharedRes.json()) as { id: number; isShared: boolean };
    assert.equal(sharedPhoto.isShared, true);

    const personalList = await fetch(`${base}/api/photos?scope=personal`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(personalList.status, 200);
    const personalItems = (await personalList.json()) as Array<{ caption: string }>;
    assert.equal(personalItems.length, 1);
    assert.equal(personalItems[0].caption, "개인");

    const familyList = await fetch(`${base}/api/photos?scope=family`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(familyList.status, 200);
    const familyItems = (await familyList.json()) as Array<{ caption: string }>;
    assert.equal(familyItems.length, 1);
    assert.equal(familyItems[0].caption, "가족");

    const fileRes = await fetch(`${base}${privatePhoto.fileUrl}`, {
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

    const memberFamilyList = await fetch(`${base}/api/photos?scope=family`, {
      headers: { authorization: `Bearer ${member.token}` },
    });
    assert.equal(memberFamilyList.status, 200);
    const memberFamilyItems = (await memberFamilyList.json()) as Array<{
      id: number;
      caption: string;
      editable: boolean;
    }>;
    assert.equal(memberFamilyItems.length, 1);
    assert.equal(memberFamilyItems[0].caption, "가족");
    assert.equal(memberFamilyItems[0].editable, false);

    const memberSharedFile = await fetch(`${base}/api/photos/${sharedPhoto.id}/file`, {
      headers: { authorization: `Bearer ${member.token}` },
    });
    assert.equal(memberSharedFile.status, 200);

    const memberPrivateFile = await fetch(`${base}/api/photos/${privatePhoto.id}/file`, {
      headers: { authorization: `Bearer ${member.token}` },
    });
    assert.equal(memberPrivateFile.status, 403);

    const memberDelete = await fetch(`${base}/api/photos/${sharedPhoto.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${member.token}` },
    });
    assert.equal(memberDelete.status, 403);

    const ownerDelete = await fetch(`${base}/api/photos/${privatePhoto.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(ownerDelete.status, 204);

    const afterDelete = await fetch(`${base}/api/photos?scope=personal`, {
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
