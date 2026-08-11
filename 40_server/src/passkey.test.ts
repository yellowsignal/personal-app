import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "./app.js";
import { MemoryAuthRepository } from "./domain/memoryAuthRepository.js";
import { MemoryInviteTokenRepository } from "./domain/memoryInviteTokenRepository.js";
import { MemoryPasskeyRepository } from "./domain/memoryPasskeyRepository.js";
import { ChallengeStore } from "./auth/challengeStore.js";
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

function fullApp() {
  return createApp(tmpStore(), {
    authRepo: new MemoryAuthRepository(),
    passkeyRepo: new MemoryPasskeyRepository(),
    inviteTokenRepo: new MemoryInviteTokenRepository(),
    challengeStore: new ChallengeStore(),
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
  return (await res.json()) as { token: string };
}

test("closed registration rejects signup without invite when users exist", async () => {
  const { server, base } = await listen(fullApp());
  try {
    await registerOwner(base);
    const res = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "random@example.com",
        password: "password123",
        name: "Stranger",
      }),
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { code?: string };
    assert.equal(body.code, "CLOSED_REGISTRATION");
  } finally {
    server.close();
  }
});

test("owner can create one-time invite token", async () => {
  const { server, base } = await listen(fullApp());
  try {
    const owner = await registerOwner(base);
    const res = await fetch(`${base}/api/family/invite/create`, {
      method: "POST",
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(res.status, 201);
    const body = (await res.json()) as { token: string; expiresAt: string };
    assert.match(body.token, /^[A-Z2-9]{8}$/);
    assert.ok(body.expiresAt);
  } finally {
    server.close();
  }
});

test("passkey register options require invite when bootstrap closed", async () => {
  const { server, base } = await listen(fullApp());
  try {
    await registerOwner(base);
    const res = await fetch(`${base}/api/auth/passkey/register/options`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ flow: "bootstrap", name: "Other" }),
    });
    assert.equal(res.status, 403);
  } finally {
    server.close();
  }
});

test("passkey login options returns public key options", async () => {
  const { server, base } = await listen(fullApp());
  try {
    const res = await fetch(`${base}/api/auth/passkey/login/options`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { challenge?: string; rpId?: string };
    assert.ok(body.challenge);
    assert.equal(body.rpId, "localhost");
  } finally {
    server.close();
  }
});
