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
        bankCode: "SHINHAN",
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
      bankCode: string;
      currency: string;
    };
    assert.equal(personalBody.isShared, false);
    assert.equal(personalBody.ownerName, "민호");
    assert.equal(personalBody.label, "급여통장");
    assert.equal(personalBody.bankCode, "SHINHAN");
    assert.equal(personalBody.currency, "KRW");

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
        bankCode: "YUCHO",
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
        bankCode: "MUFG",
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

test("deposit credentials encrypt password and reveal via passkey step-up", async () => {
  process.env.PASSKEY_REVEAL_TEST_BYPASS = "1";
  process.env.JWT_SECRET = "test-secret";
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
        label: "아이 통장",
        bankCode: "YUCHO",
        amount: 50_000,
        accountNumber: "1234567",
        loginPassword: "baby-bank-pin",
        institutionCode: "9900",
        institutionName: "ゆうちょ銀行",
        branchCode: "128",
        branchName: "二八八",
        isShared: true,
      }),
    });
    assert.equal(created.status, 201);
    const body = (await created.json()) as {
      id: number;
      accountNumber: string | null;
      hasPassword: boolean;
      institutionCode: string | null;
      institutionName: string | null;
      branchCode: string | null;
      branchName: string | null;
      loginPassword?: string;
      loginPasswordCipher?: string;
    };
    assert.equal(body.accountNumber, "1234567");
    assert.equal(body.hasPassword, true);
    assert.equal(body.institutionCode, "9900");
    assert.equal(body.institutionName, "ゆうちょ銀行");
    assert.equal(body.branchCode, "128");
    assert.equal(body.branchName, "二八八");
    assert.equal(body.loginPassword, undefined);
    assert.equal(body.loginPasswordCipher, undefined);

    const memberReg = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "member-asset-cred@example.com",
        password: "password123",
        name: "MemberAssetCred",
        inviteCode: ownerFamily.inviteCode,
      }),
    });
    const member = (await memberReg.json()) as { token: string };

    const list = await fetch(`${base}/api/assets?scope=family`, {
      headers: { authorization: `Bearer ${member.token}` },
    });
    const items = (await list.json()) as Array<{
      id: number;
      accountNumber: string | null;
      hasPassword: boolean;
      loginPassword?: string;
    }>;
    assert.equal(items.length, 1);
    assert.equal(items[0].accountNumber, "1234567");
    assert.equal(items[0].hasPassword, true);
    assert.equal(items[0].loginPassword, undefined);

    const optionsRes = await fetch(
      `${base}/api/assets/${body.id}/credentials/reveal/options`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${member.token}`,
          "content-type": "application/json",
        },
        body: "{}",
      },
    );
    assert.equal(optionsRes.status, 200);
    const options = (await optionsRes.json()) as { challenge: string };

    const verifyRes = await fetch(
      `${base}/api/assets/${body.id}/credentials/reveal/verify`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${member.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ challenge: options.challenge, bypass: true }),
      },
    );
    assert.equal(verifyRes.status, 200);
    const revealed = (await verifyRes.json()) as {
      accountNumber: string | null;
      password: string | null;
    };
    assert.equal(revealed.accountNumber, "1234567");
    assert.equal(revealed.password, "baby-bank-pin");
  } finally {
    delete process.env.PASSKEY_REVEAL_TEST_BYPASS;
    server.close();
  }
});

test("family member cannot reveal credentials on private (unshared) deposit", async () => {
  process.env.PASSKEY_REVEAL_TEST_BYPASS = "1";
  process.env.JWT_SECRET = "test-secret";
  const { server, base } = await listen(appWithAssets());
  try {
    const owner = await registerOwner(base);
    const fam = (await fetch(`${base}/api/family`, {
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
        label: "개인 통장",
        bankCode: "SHINHAN",
        amount: 10_000,
        accountNumber: "999",
        loginPassword: "private-pin",
        isShared: false,
      }),
    });
    assert.equal(created.status, 201);
    const body = (await created.json()) as { id: number };

    const memberReg = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "member-asset-private@example.com",
        password: "password123",
        name: "MemberPrivate",
        inviteCode: fam.inviteCode,
      }),
    });
    const member = (await memberReg.json()) as { token: string };

    const optionsRes = await fetch(
      `${base}/api/assets/${body.id}/credentials/reveal/options`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${member.token}`,
          "content-type": "application/json",
        },
        body: "{}",
      },
    );
    assert.equal(optionsRes.status, 403);
  } finally {
    delete process.env.PASSKEY_REVEAL_TEST_BYPASS;
    server.close();
  }
});

test("stock title follows Yahoo company name when ticker changes or price refreshes", async () => {
  const originalFetch = globalThis.fetch;
  const yahooMeta: Record<string, { price: number; shortName: string }> = {
    GOOGL: { price: 170.1, shortName: "Alphabet Inc." },
    MSFT: { price: 480.35, shortName: "Microsoft Corporation" },
  };
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(input);
    if (url.includes("finance.yahoo.com/v8/finance/chart/")) {
      const symbol = decodeURIComponent(url.split("/chart/")[1]?.split("?")[0] ?? "");
      const meta = yahooMeta[symbol];
      if (!meta) {
        return new Response(JSON.stringify({ chart: { result: [], error: { description: "not found" } } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: meta.price,
                  currency: "USD",
                  symbol,
                  shortName: meta.shortName,
                },
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  const { server, base } = await listen(appWithAssets());
  try {
    const owner = await registerOwner(base);
    const auth = { "content-type": "application/json", authorization: `Bearer ${owner.token}` };

    const created = await fetch(`${base}/api/assets`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        type: "stock",
        label: "구글",
        stockMarket: "US",
        stockCode: "GOOGL",
        quantity: 3,
        buyPrice: 100,
        isShared: false,
      }),
    });
    assert.equal(created.status, 201);
    const google = (await created.json()) as { id: number; label: string; stockCode: string };
    assert.equal(google.label, "구글");
    assert.equal(google.stockCode, "GOOGL");

    const patched = await fetch(`${base}/api/assets/${google.id}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({
        type: "stock",
        label: "구글",
        stockMarket: "US",
        stockCode: "MSFT",
        quantity: 3,
        buyPrice: 369.67,
      }),
    });
    assert.equal(patched.status, 200);
    const afterTicker = (await patched.json()) as { label: string; stockCode: string; currentPrice: number };
    assert.equal(afterTicker.stockCode, "MSFT");
    assert.equal(afterTicker.label, "Microsoft Corporation");
    assert.equal(afterTicker.currentPrice, 480.35);

    const renamed = await fetch(`${base}/api/assets/${google.id}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({
        type: "stock",
        label: "구글",
        stockMarket: "US",
        stockCode: "MSFT",
        quantity: 3,
        buyPrice: 369.67,
      }),
    });
    assert.equal(renamed.status, 200);
    assert.equal(((await renamed.json()) as { label: string }).label, "구글");

    const refreshed = await fetch(`${base}/api/assets/${google.id}/refresh-price`, {
      method: "POST",
      headers: auth,
      body: "{}",
    });
    assert.equal(refreshed.status, 200);
    assert.equal(((await refreshed.json()) as { label: string }).label, "Microsoft Corporation");

    const keptNickname = await fetch(`${base}/api/assets/${google.id}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({
        type: "stock",
        label: "마이크로소프트",
        stockMarket: "US",
        stockCode: "GOOGL",
        quantity: 3,
        buyPrice: 369.67,
      }),
    });
    assert.equal(keptNickname.status, 200);
    assert.equal(((await keptNickname.json()) as { label: string }).label, "마이크로소프트");

    const quote = await fetch(`${base}/api/assets/quote?market=US&code=MSFT`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(quote.status, 200);
    const quoteBody = (await quote.json()) as { label: string; shortName: string; price: number };
    assert.equal(quoteBody.shortName, "Microsoft Corporation");
    assert.equal(quoteBody.label, "Microsoft Corporation");
    assert.equal(quoteBody.price, 480.35);
  } finally {
    globalThis.fetch = originalFetch;
    server.close();
  }
});
