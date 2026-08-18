import assert from "node:assert/strict";
import { test } from "node:test";
import { DRILL_IN_GHOST_CLICK_MS, isDrillInGhostClick } from "./drillInClick.ts";

test("isDrillInGhostClick ignores taps that land right after opening a screen", () => {
  assert.equal(isDrillInGhostClick(1000, 1000 + DRILL_IN_GHOST_CLICK_MS - 1), true);
  assert.equal(isDrillInGhostClick(1000, 1000 + DRILL_IN_GHOST_CLICK_MS), false);
  assert.equal(isDrillInGhostClick(0, 1000), false);
});
