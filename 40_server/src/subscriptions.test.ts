import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "./app.js";
import { MemoryAuthRepository } from "./domain/memoryAuthRepository.js";
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

function appWithSubs() {
  return createApp(tmpStore(), {
    authRepo: new MemoryAuthRepository(),
    subscriptionRepo: new MemorySubscriptionRepository(),
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
  return (await res.json()) as { token: string; user: { id: number } };
}

test("subscription CRUD and scope filtering", async () => {
  const { server, base } = await listen(appWithSubs());
  try {
    const owner = await registerOwner(base);

    const personal = await fetch(`${base}/api/subscriptions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        serviceName: "Cursor Pro",
        cost: 20,
        currency: "USD",
        billingDate: 12,
        reason: "개발용",
        cancelUrl: "https://cursor.com/settings",
        isShared: false,
      }),
    });
    assert.equal(personal.status, 201);
    const personalBody = (await personal.json()) as { id: number; isShared: boolean; ownerName: string };
    assert.equal(personalBody.isShared, false);
    assert.equal(personalBody.ownerName, "민호");

    const shared = await fetch(`${base}/api/subscriptions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        serviceName: "Netflix",
        cost: 17000,
        currency: "KRW",
        billingDate: 5,
        isShared: true,
      }),
    });
    assert.equal(shared.status, 201);

    const all = await fetch(`${base}/api/subscriptions?scope=all`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(all.status, 200);
    assert.equal((await all.json() as unknown[]).length, 2);

    const personalOnly = await fetch(`${base}/api/subscriptions?scope=personal`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    const personalItems = (await personalOnly.json()) as Array<{ serviceName: string }>;
    // personal = everything I own (shared or not) so monthly spend is visible
    assert.equal(personalItems.length, 2);
    assert.deepEqual(
      personalItems.map((s) => s.serviceName).sort(),
      ["Cursor Pro", "Netflix"],
    );

    const familyOnly = await fetch(`${base}/api/subscriptions?scope=family`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    const familyItems = (await familyOnly.json()) as Array<{ serviceName: string }>;
    assert.equal(familyItems.length, 1);
    assert.equal(familyItems[0].serviceName, "Netflix");

    const updated = await fetch(`${base}/api/subscriptions/${personalBody.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({ cost: 25 }),
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json() as { cost: number }).cost, 25);

    const del = await fetch(`${base}/api/subscriptions/${personalBody.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(del.status, 204);

    const afterDelete = await fetch(`${base}/api/subscriptions`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal((await afterDelete.json() as unknown[]).length, 1);
  } finally {
    server.close();
  }
});

test("family member sees shared subscriptions from owner", async () => {
  const repo = new MemoryAuthRepository();
  const { server, base } = await listen(
    createApp(tmpStore(), {
      authRepo: repo,
      subscriptionRepo: new MemorySubscriptionRepository(),
      passkeyRepo: new MemoryPasskeyRepository(),
      inviteTokenRepo: new MemoryInviteTokenRepository(),
      challengeStore: new ChallengeStore(),
      jwtSecret: "test-secret",
    }),
  );
  try {
    const owner = await registerOwner(base);
    const ownerFamily = (await fetch(`${base}/api/family`, {
      headers: { authorization: `Bearer ${owner.token}` },
    }).then((r) => r.json())) as { inviteCode: string };

    await fetch(`${base}/api/subscriptions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        serviceName: "iCloud+",
        cost: 3300,
        currency: "KRW",
        billingDate: 15,
        isShared: true,
      }),
    });

    await fetch(`${base}/api/subscriptions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        serviceName: "Private App",
        cost: 1000,
        currency: "KRW",
        billingDate: 1,
        isShared: false,
      }),
    });

    const memberReg = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "member@example.com",
        password: "password123",
        name: "Member",
        inviteCode: ownerFamily.inviteCode,
      }),
    });
    const member = (await memberReg.json()) as { token: string };

    const list = await fetch(`${base}/api/subscriptions`, {
      headers: { authorization: `Bearer ${member.token}` },
    });
    const items = (await list.json()) as Array<{ serviceName: string }>;
    assert.equal(items.length, 1);
    assert.equal(items[0].serviceName, "iCloud+");
  } finally {
    server.close();
  }
});

test("only owner can update or delete a subscription", async () => {
  const { server, base } = await listen(appWithSubs());
  try {
    const owner = await registerOwner(base);
    const ownerFamily = (await fetch(`${base}/api/family`, {
      headers: { authorization: `Bearer ${owner.token}` },
    }).then((r) => r.json())) as { inviteCode: string };

    const created = await fetch(`${base}/api/subscriptions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        serviceName: "Shared Service",
        cost: 1000,
        currency: "KRW",
        billingDate: 10,
        isShared: true,
      }),
    });
    const sub = (await created.json()) as { id: number };

    const memberReg = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "member2@example.com",
        password: "password123",
        name: "Member2",
        inviteCode: ownerFamily.inviteCode,
      }),
    });
    const member = (await memberReg.json()) as { token: string };

    const patch = await fetch(`${base}/api/subscriptions/${sub.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${member.token}`,
      },
      body: JSON.stringify({ cost: 9999 }),
    });
    assert.equal(patch.status, 403);

    const del = await fetch(`${base}/api/subscriptions/${sub.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${member.token}` },
    });
    assert.equal(del.status, 403);
  } finally {
    server.close();
  }
});

test("subscription routes require auth", async () => {
  const { server, base } = await listen(appWithSubs());
  try {
    const res = await fetch(`${base}/api/subscriptions`);
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});
