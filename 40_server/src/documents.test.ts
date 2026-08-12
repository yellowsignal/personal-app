import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "./app.js";
import { MemoryAuthRepository } from "./domain/memoryAuthRepository.js";
import { MemoryDocumentRepository } from "./domain/memoryDocumentRepository.js";
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

test("documents personal shows only private; family shows only shared", async () => {
  const app = createApp(tmpStore(), {
    authRepo: new MemoryAuthRepository(),
    documentRepo: new MemoryDocumentRepository(),
    passkeyRepo: new MemoryPasskeyRepository(),
    inviteTokenRepo: new MemoryInviteTokenRepository(),
    challengeStore: new ChallengeStore(),
    jwtSecret: "test-secret",
  });

  const { server, base } = await listen(app);
  try {
    const owner = await registerOwner(base);
    const ownerFamily = (await fetch(`${base}/api/family`, {
      headers: { authorization: `Bearer ${owner.token}` },
    }).then((r) => r.json())) as { inviteCode: string };

    // private doc
    const privateRes = await fetch(`${base}/api/documents`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        docType: "license",
        docNumber: "11-22-334455-60",
        expiryDate: "2026-09-02",
        isShared: false,
      }),
    });
    assert.equal(privateRes.status, 201);

    // shared doc
    const sharedRes = await fetch(`${base}/api/documents`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        docType: "passport",
        docNumber: "M12345678",
        expiryDate: "2027-03-14",
        isShared: true,
      }),
    });
    assert.equal(sharedRes.status, 201);

    const personalList = await fetch(`${base}/api/documents?scope=personal`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(personalList.status, 200);
    const personalItems = await personalList.json();
    assert.equal(personalItems.length, 1);
    assert.equal(personalItems[0].docType, "license");

    const familyList = await fetch(`${base}/api/documents?scope=family`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(familyList.status, 200);
    const familyItems = await familyList.json();
    assert.equal(familyItems.length, 1);
    assert.equal(familyItems[0].docType, "passport");

    // family member sees shared doc only
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

    const memberFamilyList = await fetch(`${base}/api/documents?scope=family`, {
      headers: { authorization: `Bearer ${member.token}` },
    });
    assert.equal(memberFamilyList.status, 200);
    const memberFamilyItems = await memberFamilyList.json();
    assert.equal(memberFamilyItems.length, 1);
    assert.equal(memberFamilyItems[0].docType, "passport");

    const memberPersonalList = await fetch(`${base}/api/documents?scope=personal`, {
      headers: { authorization: `Bearer ${member.token}` },
    });
    assert.equal(memberPersonalList.status, 200);
    const memberPersonalItems = await memberPersonalList.json();
    assert.equal(memberPersonalItems.length, 0);
  } finally {
    server.close();
  }
});

