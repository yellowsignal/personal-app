import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "./app.js";
import { TaskStore } from "./store.js";
import { MemoryAuthRepository } from "./domain/memoryAuthRepository.js";
import { MemoryAssetRepository } from "./domain/memoryAssetRepository.js";
import { MemoryTransactionRepository } from "./domain/memoryTransactionRepository.js";
import { MemoryRecurringDepositRepository } from "./domain/memoryRecurringDepositRepository.js";
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
      email: "owner-recurring@example.com",
      password: "password123",
      name: "민호",
      familyName: "최가네",
    }),
  });
  assert.equal(res.status, 201);
  return (await res.json()) as { token: string };
}

test("recurring deposit applies monthly credit and set-balance works", async () => {
  const app = createApp(tmpStore(), {
    authRepo: new MemoryAuthRepository(),
    assetRepo: new MemoryAssetRepository(),
    transactionRepo: new MemoryTransactionRepository(),
    recurringDepositRepo: new MemoryRecurringDepositRepository(),
    passkeyRepo: new MemoryPasskeyRepository(),
    inviteTokenRepo: new MemoryInviteTokenRepository(),
    challengeStore: new ChallengeStore(),
    jwtSecret: "test-secret",
  });

  const { server, base } = await listen(app);
  try {
    const owner = await registerOwner(base);

    const createAsset = await fetch(`${base}/api/assets`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        type: "deposit",
        label: "아이 통장",
        bankCode: "MUFG",
        amount: 10000,
      }),
    });
    assert.equal(createAsset.status, 201);
    const asset = (await createAsset.json()) as { id: number; amount: number };
    assert.equal(asset.amount, 10000);

    const today = new Date();
    const billingDate = today.getUTCDate();

    const createRule = await fetch(`${base}/api/assets/${asset.id}/recurring-deposits`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        label: "育児手当",
        amount: 15000,
        billingInterval: "MONTHLY",
        billingDate,
      }),
    });
    assert.equal(createRule.status, 201);
    const rule = (await createRule.json()) as {
      id: number;
      label: string;
      lastAppliedOn: string | null;
    };
    assert.equal(rule.label, "育児手当");
    assert.ok(rule.lastAppliedOn, "should apply today's occurrence on create");

    const listTx = await fetch(`${base}/api/assets/${asset.id}/transactions`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(listTx.status, 200);
    const txs = (await listTx.json()) as Array<{ description: string | null; category: string; amount: number }>;
    assert.ok(txs.some((tx) => tx.description === "育児手当" && tx.category === "credit" && tx.amount === 15000));

    const assets = await fetch(`${base}/api/assets?scope=all`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    const items = (await assets.json()) as Array<{ id: number; amount: number }>;
    const updated = items.find((a) => a.id === asset.id)!;
    assert.equal(updated.amount, 25000);

    const setBal = await fetch(`${base}/api/assets/${asset.id}/set-balance`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({ amount: 50000 }),
    });
    assert.equal(setBal.status, 200);
    const afterSet = (await setBal.json()) as { amount: number };
    assert.equal(afterSet.amount, 50000);

    const del = await fetch(`${base}/api/recurring-deposits/${rule.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(del.status, 204);
  } finally {
    server.close();
  }
});

test("recurring deposit supports yearly interval", async () => {
  const app = createApp(tmpStore(), {
    authRepo: new MemoryAuthRepository(),
    assetRepo: new MemoryAssetRepository(),
    transactionRepo: new MemoryTransactionRepository(),
    recurringDepositRepo: new MemoryRecurringDepositRepository(),
    passkeyRepo: new MemoryPasskeyRepository(),
    inviteTokenRepo: new MemoryInviteTokenRepository(),
    challengeStore: new ChallengeStore(),
    jwtSecret: "test-secret",
  });

  const { server, base } = await listen(app);
  try {
    const owner = await registerOwner(base);
    const createAsset = await fetch(`${base}/api/assets`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        type: "deposit",
        label: "아이 적금",
        bankCode: "YUCHO",
        amount: 0,
        institutionCode: "9900",
        institutionName: "ゆうちょ銀行",
        branchCode: "001",
        branchName: "本店",
      }),
    });
    assert.equal(createAsset.status, 201);
    const asset = (await createAsset.json()) as {
      id: number;
      institutionCode: string | null;
      branchCode: string | null;
    };
    assert.equal(asset.institutionCode, "9900");
    assert.equal(asset.branchCode, "001");

    const today = new Date();
    const anchor = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
    const createRule = await fetch(`${base}/api/assets/${asset.id}/recurring-deposits`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        label: "연간 적립",
        amount: 100_000,
        billingInterval: "YEARLY",
        billingAnchorDate: anchor,
      }),
    });
    assert.equal(createRule.status, 201);
    const rule = (await createRule.json()) as {
      billingInterval: string;
      billingMonth: number | null;
      billingDate: number;
      lastAppliedOn: string | null;
    };
    assert.equal(rule.billingInterval, "YEARLY");
    assert.equal(rule.billingMonth, today.getUTCMonth() + 1);
    assert.equal(rule.billingDate, today.getUTCDate());
    assert.ok(rule.lastAppliedOn);
  } finally {
    server.close();
  }
});
