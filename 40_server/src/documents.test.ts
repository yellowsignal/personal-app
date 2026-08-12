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
import { DocumentScanStore } from "./storage/documentScanStore.js";

function tmpStore(): TaskStore {
  const dir = mkdtempSync(join(tmpdir(), "personal-app-"));
  return new TaskStore(join(dir, "tasks.json"));
}

function tmpScanStore(): DocumentScanStore {
  const dir = mkdtempSync(join(tmpdir(), "personal-app-scans-"));
  return new DocumentScanStore(dir);
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
    documentScanStore: tmpScanStore(),
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

    const privateRes = await fetch(`${base}/api/documents`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        typeLabel: "운전면허증",
        fields: [{ label: "면허번호", isSecret: true, value: "11-22-334455-60" }],
        expiryDate: "2026-09-02",
        isShared: false,
      }),
    });
    assert.equal(privateRes.status, 201);
    const privateBody = (await privateRes.json()) as { typeLabel: string; fields: Array<{ value: string | null; isSecret: boolean }> };
    assert.equal(privateBody.typeLabel, "운전면허증");
    assert.equal(privateBody.fields[0].isSecret, true);
    assert.equal(privateBody.fields[0].value, null);

    const sharedRes = await fetch(`${base}/api/documents`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        typeLabel: "여권",
        fields: [{ label: "여권번호", isSecret: true, value: "M12345678" }],
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
    assert.equal(personalItems[0].typeLabel, "운전면허증");

    const familyList = await fetch(`${base}/api/documents?scope=family`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(familyList.status, 200);
    const familyItems = await familyList.json();
    assert.equal(familyItems.length, 1);
    assert.equal(familyItems[0].typeLabel, "여권");

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
    assert.equal(memberFamilyItems[0].typeLabel, "여권");

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

test("document multi-field (保険証) stores secrets masked and reveals via passkey", async () => {
  process.env.PASSKEY_REVEAL_TEST_BYPASS = "1";
  const app = createApp(tmpStore(), {
    authRepo: new MemoryAuthRepository(),
    documentRepo: new MemoryDocumentRepository(),
    documentScanStore: tmpScanStore(),
    passkeyRepo: new MemoryPasskeyRepository(),
    inviteTokenRepo: new MemoryInviteTokenRepository(),
    challengeStore: new ChallengeStore(),
    jwtSecret: "test-secret",
  });

  const { server, base } = await listen(app);
  try {
    const owner = await registerOwner(base);
    const createRes = await fetch(`${base}/api/documents`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        typeLabel: "保険証",
        fields: [
          { label: "記号", isSecret: false, value: "1234" },
          { label: "番号", isSecret: true, value: "567890" },
          { label: "枝番", isSecret: true, value: "01" },
        ],
        isShared: false,
      }),
    });
    assert.equal(createRes.status, 201);
    const created = (await createRes.json()) as {
      id: number;
      fields: Array<{ label: string; value: string | null; isSecret: boolean; hasValue: boolean }>;
      hasSecrets: boolean;
    };
    assert.equal(created.hasSecrets, true);
    assert.equal(created.fields.find((f) => f.label === "記号")?.value, "1234");
    assert.equal(created.fields.find((f) => f.label === "番号")?.value, null);
    assert.equal(created.fields.find((f) => f.label === "番号")?.hasValue, true);

    const optionsRes = await fetch(`${base}/api/documents/${created.id}/fields/reveal/options`, {
      method: "POST",
      headers: { authorization: `Bearer ${owner.token}`, "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(optionsRes.status, 200);
    const options = (await optionsRes.json()) as { challenge: string };

    const verifyRes = await fetch(`${base}/api/documents/${created.id}/fields/reveal/verify`, {
      method: "POST",
      headers: { authorization: `Bearer ${owner.token}`, "content-type": "application/json" },
      body: JSON.stringify({ challenge: options.challenge, bypass: true }),
    });
    assert.equal(verifyRes.status, 200);
    const revealed = (await verifyRes.json()) as { fields: Array<{ label: string; value: string }> };
    const byLabel = Object.fromEntries(revealed.fields.map((f) => [f.label, f.value]));
    assert.equal(byLabel["番号"], "567890");
    assert.equal(byLabel["枝番"], "01");
  } finally {
    delete process.env.PASSKEY_REVEAL_TEST_BYPASS;
    server.close();
  }
});

test("document card scan stores front and back PDFs", async () => {
  const scanStore = tmpScanStore();
  const app = createApp(tmpStore(), {
    authRepo: new MemoryAuthRepository(),
    documentRepo: new MemoryDocumentRepository(),
    documentScanStore: scanStore,
    passkeyRepo: new MemoryPasskeyRepository(),
    inviteTokenRepo: new MemoryInviteTokenRepository(),
    challengeStore: new ChallengeStore(),
    jwtSecret: "test-secret",
  });

  const { server, base } = await listen(app);
  try {
    const owner = await registerOwner(base);
    const createRes = await fetch(`${base}/api/documents`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        typeLabel: "재류카드",
        fields: [{ label: "番号", isSecret: true, value: "AB12345678CD" }],
        isShared: false,
      }),
    });
    assert.equal(createRes.status, 201);
    const created = (await createRes.json()) as { id: number; hasScan: boolean; hasScanBack: boolean };
    assert.equal(created.hasScan, false);

    const frontPdf = Buffer.from("%PDF-1.4 front\n%%EOF\n");
    const backPdf = Buffer.from("%PDF-1.4 back\n%%EOF\n");

    const frontRes = await fetch(`${base}/api/documents/${created.id}/scan/front`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${owner.token}`,
        "content-type": "application/pdf",
      },
      body: frontPdf,
    });
    assert.equal(frontRes.status, 200);
    const afterFront = (await frontRes.json()) as { hasScan: boolean; hasScanBack: boolean };
    assert.equal(afterFront.hasScan, true);
    assert.equal(afterFront.hasScanBack, false);

    const backRes = await fetch(`${base}/api/documents/${created.id}/scan/back`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${owner.token}`,
        "content-type": "application/pdf",
      },
      body: backPdf,
    });
    assert.equal(backRes.status, 200);
    const afterBack = (await backRes.json()) as { hasScan: boolean; hasScanBack: boolean };
    assert.equal(afterBack.hasScanBack, true);

    const frontDl = await fetch(`${base}/api/documents/${created.id}/scan/front`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(frontDl.status, 200);
    const frontBody = Buffer.from(await frontDl.arrayBuffer());
    assert.ok(frontBody.includes(Buffer.from("front")));

    const backDl = await fetch(`${base}/api/documents/${created.id}/scan/back`, {
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(backDl.status, 200);
    const backBody = Buffer.from(await backDl.arrayBuffer());
    assert.ok(backBody.includes(Buffer.from("back")));
  } finally {
    server.close();
  }
});
