import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createApp } from "./app.js";
import { MemoryAuthRepository } from "./domain/memoryAuthRepository.js";
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

function authApp() {
  return createApp(tmpStore(), {
    authRepo: new MemoryAuthRepository(),
    jwtSecret: "test-secret",
  });
}

test("register owner creates family + invite code, then login works", async () => {
  const { server, base } = await listen(authApp());
  try {
    const reg = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "owner@example.com",
        password: "password123",
        name: "민호",
        familyName: "최가네",
        languagePref: "ko",
        currencyPref: "JPY",
      }),
    });
    assert.equal(reg.status, 201);
    const body = (await reg.json()) as {
      token: string;
      user: { role: string; email: string };
      family: { inviteCode: string; familyName: string; members: unknown[] };
    };
    assert.ok(body.token);
    assert.equal(body.user.role, "OWNER");
    assert.equal(body.family.familyName, "최가네");
    assert.match(body.family.inviteCode, /^FAM-[A-Z0-9]{5}$/);
    assert.equal(body.family.members.length, 1);

    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "owner@example.com", password: "password123" }),
    });
    assert.equal(login.status, 200);
    const loginBody = (await login.json()) as { token: string };
    assert.ok(loginBody.token);

    const me = await fetch(`${base}/api/auth/me`, {
      headers: { authorization: `Bearer ${loginBody.token}` },
    });
    assert.equal(me.status, 200);
    const meBody = (await me.json()) as { user: { email: string }; family: { inviteCode: string } };
    assert.equal(meBody.user.email, "owner@example.com");
    assert.equal(meBody.family.inviteCode, body.family.inviteCode);
  } finally {
    server.close();
  }
});

test("member can join via invite code at register", async () => {
  const repo = new MemoryAuthRepository();
  const app = createApp(tmpStore(), { authRepo: repo, jwtSecret: "test-secret" });
  const { server, base } = await listen(app);
  try {
    const ownerRes = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "owner2@example.com",
        password: "password123",
        name: "Owner",
        familyName: "Test Family",
      }),
    });
    const owner = (await ownerRes.json()) as { family: { inviteCode: string; id: number } };

    const memberRes = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "member@example.com",
        password: "password123",
        name: "Member",
        inviteCode: owner.family.inviteCode,
      }),
    });
    assert.equal(memberRes.status, 201);
    const member = (await memberRes.json()) as {
      user: { role: string; familyId: number };
      family: { members: unknown[]; inviteCode: string };
    };
    assert.equal(member.user.role, "MEMBER");
    assert.equal(member.user.familyId, owner.family.id);
    assert.equal(member.family.members.length, 2);
    assert.equal(member.family.inviteCode, owner.family.inviteCode);
  } finally {
    server.close();
  }
});

test("owner can rotate invite code; invalid login rejected", async () => {
  const { server, base } = await listen(authApp());
  try {
    const reg = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "owner3@example.com",
        password: "password123",
        name: "Owner",
      }),
    });
    const owner = (await reg.json()) as { token: string; family: { inviteCode: string } };
    const oldCode = owner.family.inviteCode;

    const rotated = await fetch(`${base}/api/family/invite/rotate`, {
      method: "POST",
      headers: { authorization: `Bearer ${owner.token}` },
    });
    assert.equal(rotated.status, 200);
    const family = (await rotated.json()) as { inviteCode: string };
    assert.notEqual(family.inviteCode, oldCode);

    const bad = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "owner3@example.com", password: "wrong-password" }),
    });
    assert.equal(bad.status, 401);
  } finally {
    server.close();
  }
});

test("duplicate email is rejected", async () => {
  const { server, base } = await listen(authApp());
  try {
    const payload = {
      email: "dup@example.com",
      password: "password123",
      name: "One",
    };
    const first = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(first.status, 201);
    const second = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(second.status, 409);
  } finally {
    server.close();
  }
});
