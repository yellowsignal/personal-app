import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "./app.js";
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

test("health endpoint responds ok", async () => {
  const { server, base } = await listen(createApp(tmpStore()));
  try {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      status: string;
      time: string;
      tz: string | null;
      resolvedTimeZone: string;
    };
    assert.equal(body.status, "ok");
    assert.ok(typeof body.time === "string");
    assert.ok(typeof body.resolvedTimeZone === "string");
    assert.ok("tz" in body);
  } finally {
    server.close();
  }
});

test("create, list, toggle and delete a task end-to-end", async () => {
  const { server, base } = await listen(createApp(tmpStore()));
  try {
    const created = await fetch(`${base}/api/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Write tests" }),
    });
    assert.equal(created.status, 201);
    const task = (await created.json()) as { id: string; title: string; done: boolean };
    assert.equal(task.title, "Write tests");
    assert.equal(task.done, false);

    const listed = await (await fetch(`${base}/api/tasks`)).json();
    assert.equal((listed as unknown[]).length, 1);

    const toggled = await (
      await fetch(`${base}/api/tasks/${task.id}`, { method: "PATCH" })
    ).json();
    assert.equal((toggled as { done: boolean }).done, true);

    const del = await fetch(`${base}/api/tasks/${task.id}`, { method: "DELETE" });
    assert.equal(del.status, 204);

    const finalList = await (await fetch(`${base}/api/tasks`)).json();
    assert.equal((finalList as unknown[]).length, 0);
  } finally {
    server.close();
  }
});

test("rejects empty task titles", async () => {
  const { server, base } = await listen(createApp(tmpStore()));
  try {
    const res = await fetch(`${base}/api/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "   " }),
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});
