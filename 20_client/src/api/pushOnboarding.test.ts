import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldShowPushOnboarding } from "./pushOnboarding";

test("shows only on first home-screen launch while permission is default", () => {
  assert.equal(
    shouldShowPushOnboarding({
      hasToken: true,
      standalone: true,
      permission: "default",
      alreadyAsked: false,
    }),
    true,
  );
});

test("hides in Safari tab, after ask, or when OS already decided", () => {
  const base = {
    hasToken: true,
    standalone: true,
    permission: "default" as const,
    alreadyAsked: false,
  };
  assert.equal(shouldShowPushOnboarding({ ...base, hasToken: false }), false);
  assert.equal(shouldShowPushOnboarding({ ...base, standalone: false }), false);
  assert.equal(shouldShowPushOnboarding({ ...base, alreadyAsked: true }), false);
  assert.equal(shouldShowPushOnboarding({ ...base, permission: "granted" }), false);
  assert.equal(shouldShowPushOnboarding({ ...base, permission: "denied" }), false);
  assert.equal(shouldShowPushOnboarding({ ...base, permission: "unsupported" }), false);
});
