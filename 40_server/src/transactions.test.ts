import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "./app.js";
import { MemoryAuthRepository } from "./domain/memoryAuthRepository.js";
import { MemoryAssetRepository } from "./domain/memoryAssetRepository.js";
import { MemoryTransactionRepository } from "./domain/memoryTransactionRepository.js";
import { MemoryPasskeyRepository } from "./domain/memoryPasskeyRepository.js";
import { MemoryInviteTokenRepository } from "./domain/memoryInviteTokenRepository.js";
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

test("deposit statement CSV import and list transactions", async () => {
  const app = createApp(tmpStore(), {
    authRepo: new MemoryAuthRepository(),
    assetRepo: new MemoryAssetRepository(),
    transactionRepo: new MemoryTransactionRepository(),
    passkeyRepo: new MemoryPasskeyRepository(),
    inviteTokenRepo: new MemoryInviteTokenRepository(),
    challengeStore: new ChallengeStore(),
    jwtSecret: "test-secret",
  });

  const { server, base } = await listen(app);
  try {
    const owner = await registerOwner(base);
    const createRes = await fetch(`${base}/api/assets`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        type: "deposit",
        label: "신한 주거래",
        bankCode: "SHINHAN",
        amount: 100000,
      }),
    });
    assert.equal(createRes.status, 201);
    const asset = (await createRes.json()) as { id: number; amount: number };

    const csv = `거래일자,적요,입금액,출금액,잔액
2026-01-05,급여,3500000,,3500000
2026-01-10,카드결제,,120000,3380000`;

    const importRes = await fetch(`${base}/api/assets/${asset.id}/import-statement`, {
      method: "POST",
      headers: {
        "content-type": "text/csv",
        authorization: `Bearer ${owner.token}`,
      },
      body: csv,
    });
    assert.equal(importRes.status, 201);
    const imported = (await importRes.json()) as {
      imported: number;
      skipped: number;
      asset: { amount: number };
    };
    assert.equal(imported.imported, 2);
    assert.equal(imported.skipped, 0);
    assert.equal(imported.asset.amount, 3380000);

    const listRes = await fetch(`${base}/api/assets/${asset.id}/transactions`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(listRes.status, 200);
    const txns = (await listRes.json()) as Array<{ category: string; amount: number }>;
    assert.equal(txns.length, 2);

    const dupRes = await fetch(`${base}/api/assets/${asset.id}/import-statement`, {
      method: "POST",
      headers: {
        "content-type": "text/csv",
        authorization: `Bearer ${owner.token}`,
      },
      body: csv,
    });
    assert.equal(dupRes.status, 201);
    const dupBody = (await dupRes.json()) as { imported: number; skipped: number };
    assert.equal(dupBody.imported, 0);
    assert.equal(dupBody.skipped, 2);
  } finally {
    server.close();
  }
});
