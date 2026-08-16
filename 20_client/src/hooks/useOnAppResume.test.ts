import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldRefreshOnVisibilityState } from "./useOnAppResume.ts";

test("shouldRefreshOnVisibilityState skips hidden documents", () => {
  assert.equal(shouldRefreshOnVisibilityState("hidden"), false);
  assert.equal(shouldRefreshOnVisibilityState("visible"), true);
  assert.equal(shouldRefreshOnVisibilityState(undefined), true);
});
