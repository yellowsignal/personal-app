import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "./app.js";
import { MemoryAuthRepository } from "./domain/memoryAuthRepository.js";
import { MemoryAssetRepository } from "./domain/memoryAssetRepository.js";
import { MemorySubscriptionRepository } from "./domain/memorySubscriptionRepository.js";
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

function appWithAssets() {
  return createApp(tmpStore(), {
    authRepo: new MemoryAuthRepository(),
    subscriptionRepo: new MemorySubscriptionRepository(),
    assetRepo: new MemoryAssetRepository(),
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
      email: "owner-asset@example.com",
      password: "password123",
      name: "민호",
      familyName: "최가네",
    }),
  });
  assert.equal(res.status, 201);
  return (await res.json()) as { token: string; user: { id: number } };
}

test("asset CRUD and scope filtering", async () => {
  const { server, base } = await listen(appWithAssets());
  try {
    const owner = await registerOwner(base);

    const personal = await fetch(`${base}/api/assets`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        type: "deposit",
        label: "급여통장",
        currency: "KRW",
        amount: 1_000_000,
        isShared: false,
      }),
    });
    assert.equal(personal.status, 201);
    const personalBody = (await personal.json()) as {
      id: number;
      isShared: boolean;
      ownerName: string;
      label: string;
    };
    assert.equal(personalBody.isShared, false);
    assert.equal(personalBody.ownerName, "민호");
    assert.equal(personalBody.label, "급여통장");

    const shared = await fetch(`${base}/api/assets`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        type: "stock",
        label: "Apple",
        stockMarket: "US",
        stockCode: "AAPL",
        quantity: 10,
        buyPrice: 165.2,
        isShared: true,
      }),
    });
    assert.equal(shared.status, 201);
    const stockBody = (await shared.json()) as {
      currency: string;
      quantity: number;
      buyPrice: number;
      amount: number;
      stockMarket: string;
    };
    assert.equal(stockBody.currency, "USD");
    assert.equal(stockBody.quantity, 10);
    assert.equal(stockBody.buyPrice, 165.2);
    assert.equal(stockBody.stockMarket, "US");
    assert.ok(stockBody.amount > 0);

    const all = await fetch(`${base}/api/assets?scope=all`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(((await all.json()) as unknown[]).length, 2);

    const familyOnly = await fetch(`${base}/api/assets?scope=family`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    const familyItems = (await familyOnly.json()) as Array<{ label: string }>;
    assert.equal(familyItems.length, 1);
    assert.equal(familyItems[0].label, "Apple");

    const patched = await fetch(`${base}/api/assets/${personalBody.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({ amount: 1_200_000 }),
    });
    assert.equal(patched.status, 200);
    assert.equal(((await patched.json()) as { amount: number }).amount, 1_200_000);

    const del = await fetch(`${base}/api/assets/${personalBody.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(del.status, 204);
  } finally {
    server.close();
  }
});

test("family member sees shared assets from owner", async () => {
  const { server, base } = await listen(appWithAssets());
  try {
    const owner = await registerOwner(base);
    const ownerFamily = (await fetch(`${base}/api/family`, {
      headers: { authorization: `Bearer ${owner.token}` },
    }).then((r) => r.json())) as { inviteCode: string };

    await fetch(`${base}/api/assets`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        type: "cash",
        label: "비상금",
        currency: "JPY",
        amount: 50_000,
        isShared: true,
      }),
    });

    await fetch(`${base}/api/assets`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        type: "deposit",
        label: "개인통장",
        currency: "KRW",
        amount: 1000,
        isShared: false,
      }),
    });

    const memberReg = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "member-asset@example.com",
        password: "password123",
        name: "Member",
        inviteCode: ownerFamily.inviteCode,
      }),
    });
    const member = (await memberReg.json()) as { token: string };

    const list = await fetch(`${base}/api/assets`, {
      headers: { authorization: `Bearer ${member.token}` },
    });
    const items = (await list.json()) as Array<{ label: string }>;
    assert.equal(items.length, 1);
    assert.equal(items[0].label, "비상금");
  } finally {
    server.close();
  }
});

test("only owner can update or delete an asset", async () => {
  const { server, base } = await listen(appWithAssets());
  try {
    const owner = await registerOwner(base);
    const ownerFamily = (await fetch(`${base}/api/family`, {
      headers: { authorization: `Bearer ${owner.token}` },
    }).then((r) => r.json())) as { inviteCode: string };

    const created = await fetch(`${base}/api/assets`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        type: "deposit",
        label: "공유예금",
        currency: "KRW",
        amount: 5000,
        isShared: true,
      }),
    });
    const asset = (await created.json()) as { id: number };

    const memberReg = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "member-asset2@example.com",
        password: "password123",
        name: "Member2",
        inviteCode: ownerFamily.inviteCode,
      }),
    });
    const member = (await memberReg.json()) as { token: string };

    const patch = await fetch(`${base}/api/assets/${asset.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${member.token}`,
      },
      body: JSON.stringify({ amount: 9999 }),
    });
    assert.equal(patch.status, 403);

    const del = await fetch(`${base}/api/assets/${asset.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${member.token}` },
    });
    assert.equal(del.status, 403);
  } finally {
    server.close();
  }
});

test("asset routes require auth", async () => {
  const { server, base } = await listen(appWithAssets());
  try {
    const res = await fetch(`${base}/api/assets`);
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});
