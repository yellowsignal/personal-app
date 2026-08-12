import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "./app.js";
import { MemoryAuthRepository } from "./domain/memoryAuthRepository.js";
import { MemoryChecklistRepository } from "./domain/memoryChecklistRepository.js";
import { CHECKLIST_COMPLETED_RETENTION_MS } from "./domain/checklistTypes.js";
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

function appWithChecklists(repo = new MemoryChecklistRepository()) {
  return {
    repo,
    app: createApp(tmpStore(), {
      authRepo: new MemoryAuthRepository(),
      checklistRepo: repo,
      jwtSecret: "test-secret",
    }),
  };
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

test("checklist tree create, complete keeps item, edit and delete", async () => {
  const { app } = appWithChecklists();
  const { server, base } = await listen(app);
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

    const root = await fetch(`${base}/api/checklists/${list.id}/items`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({ title: "과일" }),
    });
    assert.equal(root.status, 201);
    const rootItem = (await root.json()) as {
      id: number;
      parentId: number | null;
      completedAt: string | null;
    };
    assert.equal(rootItem.parentId, null);
    assert.equal(rootItem.completedAt, null);

    const child = await fetch(`${base}/api/checklists/${list.id}/items`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({ title: "사과", parentId: rootItem.id }),
    });
    assert.equal(child.status, 201);
    const childBody = (await child.json()) as { id: number };
    const childItemId = childBody.id;

    const tryCompleteRoot = await fetch(`${base}/api/checklists/${list.id}/items/${rootItem.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({ completed: true }),
    });
    assert.equal(tryCompleteRoot.status, 400);

    const completeChild = await fetch(`${base}/api/checklists/${list.id}/items/${childItemId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({ completed: true }),
    });
    assert.equal(completeChild.status, 200);

    const completeRoot = await fetch(`${base}/api/checklists/${list.id}/items/${rootItem.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({ completed: true }),
    });
    assert.equal(completeRoot.status, 200);
    const completedBody = (await completeRoot.json()) as { completedAt: string | null };
    assert.ok(completedBody.completedAt);

    const detail = await fetch(`${base}/api/checklists/${list.id}`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    const detailBody = (await detail.json()) as {
      items: Array<{ id: number; completedAt: string | null }>;
    };
    assert.equal(detailBody.items.length, 2);
    assert.ok(detailBody.items.find((i) => i.id === rootItem.id)?.completedAt);

    const renamed = await fetch(`${base}/api/checklists/${list.id}/items/${rootItem.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({ title: "과일류" }),
    });
    assert.equal(renamed.status, 200);
    assert.equal(((await renamed.json()) as { title: string }).title, "과일류");

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

test("completed items older than retention are purged on list", async () => {
  const { repo, app } = appWithChecklists();
  const { server, base } = await listen(app);
  try {
    const owner = await registerOwner(base);

    const created = await fetch(`${base}/api/checklists`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({ title: "할 일" }),
    });
    const list = (await created.json()) as { id: number };

    const keepRes = await fetch(`${base}/api/checklists/${list.id}/items`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({ title: "최근 완료" }),
    });
    const keep = (await keepRes.json()) as { id: number };

    const oldRes = await fetch(`${base}/api/checklists/${list.id}/items`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({ title: "오래된 완료" }),
    });
    const old = (await oldRes.json()) as { id: number };

    await repo.updateItem(keep.id, { completedAt: new Date() });
    await repo.updateItem(old.id, {
      completedAt: new Date(Date.now() - CHECKLIST_COMPLETED_RETENTION_MS - 60_000),
    });

    const listed = await fetch(`${base}/api/checklists?scope=all`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(listed.status, 200);

    const detail = await fetch(`${base}/api/checklists/${list.id}`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    const body = (await detail.json()) as { items: Array<{ id: number; title: string }> };
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].id, keep.id);
    assert.equal(body.items[0].title, "최근 완료");
  } finally {
    server.close();
  }
});
