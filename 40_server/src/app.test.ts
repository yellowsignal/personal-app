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

test("starter /api/tasks is disabled without auth", async () => {
  const { server, base } = await listen(createApp(tmpStore()));
  try {
    const listed = await fetch(`${base}/api/tasks`);
    assert.equal(listed.status, 410);
    const body = (await listed.json()) as { code?: string };
    assert.equal(body.code, "TASKS_DISABLED");

    const created = await fetch(`${base}/api/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "should not work" }),
    });
    assert.equal(created.status, 410);
  } finally {
    server.close();
  }
});

test("CORS rejects unknown browser origins", async () => {
  const { server, base } = await listen(createApp(tmpStore()));
  try {
    const res = await fetch(`${base}/api/health`, {
      headers: { origin: "https://evil.example" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  } finally {
    server.close();
  }
});

test("CORS allows prod DuckDNS origin", async () => {
  const { server, base } = await listen(createApp(tmpStore()));
  try {
    const res = await fetch(`${base}/api/health`, {
      headers: { origin: "https://sumicchogurashi.duckdns.org" },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), "https://sumicchogurashi.duckdns.org");
  } finally {
    server.close();
  }
});
