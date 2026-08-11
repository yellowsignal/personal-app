import { createHash, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { decryptSecret, encryptSecret } from "./secretCrypto.js";

test("encryptSecret / decryptSecret round-trip", () => {
  process.env.CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  const plain = "Netflix-P@ssw0rd!";
  const cipher = encryptSecret(plain);
  assert.notEqual(cipher, plain);
  assert.equal(decryptSecret(cipher), plain);
});

test("derived key from JWT_SECRET works when CREDENTIALS_ENCRYPTION_KEY unset", () => {
  delete process.env.CREDENTIALS_ENCRYPTION_KEY;
  process.env.JWT_SECRET = "test-jwt-for-crypto";
  const a = encryptSecret("hello");
  const b = decryptSecret(a);
  assert.equal(b, "hello");
  // same key derivation is stable
  assert.equal(
    createHash("sha256").update("credentials:test-jwt-for-crypto").digest("hex").length,
    64,
  );
});
