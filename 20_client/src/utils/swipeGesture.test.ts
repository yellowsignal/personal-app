import assert from "node:assert/strict";
import { test } from "node:test";
import { clampSwipeOffset, settleSwipe } from "./swipeGesture";

test("settleSwipe stays closed for small left or any right movement", () => {
  assert.equal(settleSwipe(0, 0), "closed");
  assert.equal(settleSwipe(-20, 0), "closed");
  assert.equal(settleSwipe(30, -1), "closed");
});

test("settleSwipe opens the delete action around the snap threshold", () => {
  assert.equal(settleSwipe(-40, 0), "open");
  assert.equal(settleSwipe(-80, 0), "open");
});

test("settleSwipe deletes on a long swipe or a fast flick", () => {
  assert.equal(settleSwipe(-160, 0), "delete");
  assert.equal(settleSwipe(-80, -0.9), "delete");
});

test("clampSwipeOffset rubber-bands to the right and caps the left", () => {
  assert.equal(clampSwipeOffset(40), 10);
  assert.ok(clampSwipeOffset(-400) > -400);
});
