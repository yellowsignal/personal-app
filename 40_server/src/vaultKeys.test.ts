import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "./app.js";
import { TaskStore } from "./store.js";
import { MemoryAuthRepository } from "./domain/memoryAuthRepository.js";
import { MemoryVaultKeyRepository } from "./domain/memoryVaultKeyRepository.js";
import { MemorySubscriptionRepository } from "./domain/memorySubscriptionRepository.js";
import { ChallengeStore } from "./auth/challengeStore.js";
import { MemoryPasskeyRepository } from "./domain/memoryPasskeyRepository.js";
import { MemoryInviteTokenRepository } from "./domain/memoryInviteTokenRepository.js";
import { isClientE2eCipher } from "./auth/e2eCipher.js";

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

function appWithVaultKeys() {
  return createApp(tmpStore(), {
    authRepo: new MemoryAuthRepository(),
    vaultKeyRepo: new MemoryVaultKeyRepository(),
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
      email: "vault-owner@example.com",
      password: "password123",
      name: "민호",
      familyName: "최가네",
    }),
  });
  assert.equal(res.status, 201);
  return (await res.json()) as { token: string; user: { id: number } };
}

test("isClientE2eCipher accepts e2e1 scope tags", () => {
  assert.equal(isClientE2eCipher("e2e1.p.YWJj"), true);
  assert.equal(isClientE2eCipher("e2e1.f.YWJj"), true);
  assert.equal(isClientE2eCipher("not-e2e"), false);
  assert.equal(isClientE2eCipher("e2e1.x.YWJj"), false);
});

test("vault-keys setup and me round-trip", async () => {
  const { server, base } = await listen(appWithVaultKeys());
  try {
    const owner = await registerOwner(base);

    const before = await fetch(`${base}/api/vault-keys/me`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(before.status, 200);
    const beforeBody = (await before.json()) as { configured: boolean };
    assert.equal(beforeBody.configured, false);

    const setup = await fetch(`${base}/api/vault-keys/setup`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        kdfSalt: "c2FsdA",
        kdfIterations: 310_000,
        personalDekWrapped: "wrapped-personal",
        privateKeyWrapped: "wrapped-private",
        publicKeyJwk: JSON.stringify({ kty: "RSA", n: "x", e: "AQAB" }),
        familyDekWrapped: "wrapped-family",
      }),
    });
    assert.equal(setup.status, 201);
    const setupBody = (await setup.json()) as { configured: boolean; hasFamilyDek: boolean };
    assert.equal(setupBody.configured, true);
    assert.equal(setupBody.hasFamilyDek, true);

    const me = await fetch(`${base}/api/vault-keys/me`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(me.status, 200);
    const meBody = (await me.json()) as {
      configured: boolean;
      package: { personalDekWrapped: string; hasFamilyDek: boolean } | null;
    };
    assert.equal(meBody.configured, true);
    assert.equal(meBody.package?.personalDekWrapped, "wrapped-personal");
    assert.equal(meBody.package?.hasFamilyDek, true);

    const dup = await fetch(`${base}/api/vault-keys/setup`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        kdfSalt: "c2FsdA",
        kdfIterations: 310_000,
        personalDekWrapped: "wrapped-personal",
        privateKeyWrapped: "wrapped-private",
        publicKeyJwk: "{}",
        familyDekWrapped: "wrapped-family",
      }),
    });
    assert.equal(dup.status, 409);
  } finally {
    server.close();
  }
});

test("subscription stores client e2e cipher and reveal returns cipher only", async () => {
  process.env.PASSKEY_REVEAL_TEST_BYPASS = "1";
  process.env.JWT_SECRET = "test-secret";
  const { server, base } = await listen(appWithVaultKeys());
  try {
    const owner = await registerOwner(base);
    const cipher = "e2e1.f." + "A".repeat(48);

    const created = await fetch(`${base}/api/subscriptions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        serviceName: "Netflix E2E",
        cost: 17000,
        currency: "KRW",
        billingInterval: "MONTHLY",
        billingAnchorDate: "2026-01-05",
        loginId: "family@netflix.example",
        loginPasswordCipher: cipher,
        isShared: true,
      }),
    });
    assert.equal(created.status, 201);
    const body = (await created.json()) as {
      id: number;
      hasPassword: boolean;
      loginPassword?: string;
      loginPasswordCipher?: string;
    };
    assert.equal(body.hasPassword, true);
    assert.equal(body.loginPassword, undefined);
    assert.equal(body.loginPasswordCipher, undefined);

    const optionsRes = await fetch(
      `${base}/api/subscriptions/${body.id}/credentials/reveal/options`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${owner.token}`,
          "content-type": "application/json",
        },
        body: "{}",
      },
    );
    assert.equal(optionsRes.status, 200);
    const options = (await optionsRes.json()) as { challenge: string };

    const reveal = await fetch(`${base}/api/subscriptions/${body.id}/credentials/reveal/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({ challenge: options.challenge, bypass: true }),
    });
    assert.equal(reveal.status, 200);
    const revealed = (await reveal.json()) as {
      encryption: string;
      password: string | null;
      passwordCipher: string | null;
      loginId: string | null;
    };
    assert.equal(revealed.encryption, "e2e");
    assert.equal(revealed.password, null);
    assert.equal(revealed.passwordCipher, cipher);
    assert.equal(revealed.loginId, "family@netflix.example");

    const bad = await fetch(`${base}/api/subscriptions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        serviceName: "Bad Cipher",
        cost: 1,
        currency: "KRW",
        billingInterval: "MONTHLY",
        billingAnchorDate: "2026-01-05",
        loginPasswordCipher: "not-a-valid-e2e",
        isShared: false,
      }),
    });
    assert.equal(bad.status, 400);
  } finally {
    delete process.env.PASSKEY_REVEAL_TEST_BYPASS;
    server.close();
  }
});

test("family DEK deliver and accept", async () => {
  const { server, base } = await listen(appWithVaultKeys());
  try {
    const owner = await registerOwner(base);
    const family = (await fetch(`${base}/api/family`, {
      headers: { authorization: `Bearer ${owner.token}` },
    }).then((r) => r.json())) as { inviteCode: string };

    await fetch(`${base}/api/vault-keys/setup`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        kdfSalt: "c2FsdA",
        kdfIterations: 310_000,
        personalDekWrapped: "owner-personal",
        privateKeyWrapped: "owner-private",
        publicKeyJwk: JSON.stringify({ kty: "RSA", n: "owner", e: "AQAB" }),
        familyDekWrapped: "owner-family",
      }),
    });

    const memberReg = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "vault-member@example.com",
        password: "password123",
        name: "아내",
        inviteCode: family.inviteCode,
      }),
    });
    assert.equal(memberReg.status, 201);
    const member = (await memberReg.json()) as { token: string; user: { id: number } };

    await fetch(`${base}/api/vault-keys/setup`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${member.token}`,
      },
      body: JSON.stringify({
        kdfSalt: "c2FsdGIy",
        kdfIterations: 310_000,
        personalDekWrapped: "member-personal",
        privateKeyWrapped: "member-private",
        publicKeyJwk: JSON.stringify({ kty: "RSA", n: "member", e: "AQAB" }),
        familyDekWrapped: null,
      }),
    });

    const deliver = await fetch(`${base}/api/vault-keys/deliver-family`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        toUserId: member.user.id,
        ciphertext: "rsa-wrapped-family-dek",
      }),
    });
    assert.equal(deliver.status, 200);

    const me = await fetch(`${base}/api/vault-keys/me`, {
      headers: { authorization: `Bearer ${member.token}` },
    });
    const meBody = (await me.json()) as {
      pendingFamilyDek: { ciphertext: string } | null;
      package: { hasFamilyDek: boolean } | null;
    };
    assert.equal(meBody.pendingFamilyDek?.ciphertext, "rsa-wrapped-family-dek");
    assert.equal(meBody.package?.hasFamilyDek, false);

    const accept = await fetch(`${base}/api/vault-keys/accept-family`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${member.token}`,
      },
      body: JSON.stringify({ familyDekWrapped: "member-family-wrapped" }),
    });
    assert.equal(accept.status, 200);

    const me2 = await fetch(`${base}/api/vault-keys/me`, {
      headers: { authorization: `Bearer ${member.token}` },
    });
    const me2Body = (await me2.json()) as {
      pendingFamilyDek: unknown;
      package: { hasFamilyDek: boolean; familyDekWrapped: string | null } | null;
    };
    assert.equal(me2Body.pendingFamilyDek, null);
    assert.equal(me2Body.package?.hasFamilyDek, true);
    assert.equal(me2Body.package?.familyDekWrapped, "member-family-wrapped");
  } finally {
    server.close();
  }
});
