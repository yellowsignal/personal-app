import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "./app.js";
import { TaskStore } from "./store.js";
import { MemoryAuthRepository } from "./domain/memoryAuthRepository.js";
import { MemoryVaultItemRepository } from "./domain/memoryVaultItemRepository.js";
import { ChallengeStore } from "./auth/challengeStore.js";
import { MemoryPasskeyRepository } from "./domain/memoryPasskeyRepository.js";
import { MemoryInviteTokenRepository } from "./domain/memoryInviteTokenRepository.js";

function tmpStore(): TaskStore {
  const dir = mkdtempSync(join(tmpdir(), "personal-app-"));
  return new TaskStore(join(dir, "tasks.json"));
}

async function listen(app: ReturnType<typeof createApp>) {
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("expected TCP address");
  return { server, base: `http://127.0.0.1:${address.port}` };
}

test("personal vault CRUD hides secrets until owned list", async () => {
  const authRepo = new MemoryAuthRepository();
  const vaultRepo = new MemoryVaultItemRepository();
  const app = createApp(tmpStore(), {
    authRepo,
    vaultRepo,
    passkeyRepo: new MemoryPasskeyRepository(),
    inviteTokenRepo: new MemoryInviteTokenRepository(),
    challengeStore: new ChallengeStore(),
    jwtSecret: "test-secret",
  });

  const { server, base } = await listen(app);
  try {
    const reg = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "vault@example.com",
        password: "password123",
        name: "민호",
        familyName: "최가네",
      }),
    });
    assert.equal(reg.status, 201);
    const { token } = (await reg.json()) as { token: string };

    const created = await fetch(`${base}/api/vault`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: "회사 포털",
        category: "LOGIN",
        url: "https://intranet.example.com",
        loginId: "EMP-1001",
        secret: "s3cret!",
        memo: "VPN 후 접속",
      }),
    });
    assert.equal(created.status, 201);
    const item = (await created.json()) as {
      id: number;
      title: string;
      hasLoginId: boolean;
      hasSecret: boolean;
      loginId?: string;
      secret?: string;
    };
    assert.equal(item.title, "회사 포털");
    assert.equal(item.hasLoginId, true);
    assert.equal(item.hasSecret, true);
    assert.equal(item.loginId, undefined);
    assert.equal(item.secret, undefined);

    const list = await fetch(`${base}/api/vault`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(list.status, 200);
    const items = (await list.json()) as Array<{ id: number; title: string }>;
    assert.equal(items.length, 1);

    const key = await fetch(`${base}/api/vault`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: "Office",
        category: "PRODUCT_KEY",
        secret: "XXXXX-YYYYY-ZZZZZ",
      }),
    });
    assert.equal(key.status, 201);

    const patched = await fetch(`${base}/api/vault/${item.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title: "회사 사번" }),
    });
    assert.equal(patched.status, 200);
    const updated = (await patched.json()) as { title: string; hasSecret: boolean };
    assert.equal(updated.title, "회사 사번");
    assert.equal(updated.hasSecret, true);

    const del = await fetch(`${base}/api/vault/${item.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(del.status, 204);
  } finally {
    server.close();
  }
});
