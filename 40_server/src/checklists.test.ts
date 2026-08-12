import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "./app.js";
import { MemoryAuthRepository } from "./domain/memoryAuthRepository.js";
import { MemoryChecklistRepository } from "./domain/memoryChecklistRepository.js";
import { TaskStore } from "./store.js";

function tmpStore(): TaskStore {
  const dir = mkdtempSync(join(tmpdir(), "personal-app-"));
  return new TaskStore(join(dir, "tasks.json"));
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

function appWithChecklists() {
  return createApp(tmpStore(), {
    authRepo: new MemoryAuthRepository(),
    checklistRepo: new MemoryChecklistRepository(),
    jwtSecret: "test-secret",
  });
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

test("checklist tree create, add nested items, delete cascades", async () => {
  const { server, base } = await listen(appWithChecklists());
  try {
    const owner = await registerOwner(base);

    const created = await fetch(`${base}/api/checklists`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({ title: "장보기", isShared: true }),
    });
    assert.equal(created.status, 201);
    const list = (await created.json()) as { id: number; title: string; itemCount: number };
    assert.equal(list.title, "장보기");
    assert.equal(list.itemCount, 0);

    const root = await fetch(`${base}/api/checklists/${list.id}/items`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({ title: "과일" }),
    });
    assert.equal(root.status, 201);
    const rootItem = (await root.json()) as { id: number; parentId: number | null };
    assert.equal(rootItem.parentId, null);

    const child = await fetch(`${base}/api/checklists/${list.id}/items`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({ title: "사과", parentId: rootItem.id }),
    });
    assert.equal(child.status, 201);
    const childItem = (await child.json()) as { id: number; parentId: number };
    assert.equal(childItem.parentId, rootItem.id);

    const detail = await fetch(`${base}/api/checklists/${list.id}`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(detail.status, 200);
    const detailBody = (await detail.json()) as { items: unknown[] };
    assert.equal(detailBody.items.length, 2);

    const del = await fetch(`${base}/api/checklists/${list.id}/items/${rootItem.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(del.status, 204);

    const after = await fetch(`${base}/api/checklists/${list.id}`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    const afterBody = (await after.json()) as { items: unknown[]; itemCount: number };
    assert.equal(afterBody.items.length, 0);
    assert.equal(afterBody.itemCount, 0);
  } finally {
    server.close();
  }
});
