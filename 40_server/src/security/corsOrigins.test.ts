import assert from "node:assert/strict";
import { test } from "node:test";
import { allowedCorsOrigins, isAllowedCorsOrigin } from "./corsOrigins.ts";

test("allowedCorsOrigins always includes prod and dig DuckDNS HTTPS", () => {
  const list = allowedCorsOrigins({});
  assert.ok(list.includes("https://sumicchogurashi.duckdns.org"));
  assert.ok(list.includes("https://sumicchogurashi-dev.duckdns.org"));
});

test("isAllowedCorsOrigin allows missing Origin and listed hosts", () => {
  assert.equal(isAllowedCorsOrigin(undefined), true);
  assert.equal(isAllowedCorsOrigin("https://sumicchogurashi.duckdns.org"), true);
  assert.equal(isAllowedCorsOrigin("https://evil.example"), false);
});

test("WEBAUTHN_ORIGIN and CORS_ORIGINS extend the allowlist", () => {
  const list = allowedCorsOrigins({
    WEBAUTHN_ORIGIN: "https://custom.example",
    CORS_ORIGINS: "https://a.example, https://b.example",
  });
  assert.ok(list.includes("https://custom.example"));
  assert.ok(list.includes("https://a.example"));
  assert.ok(list.includes("https://b.example"));
});
