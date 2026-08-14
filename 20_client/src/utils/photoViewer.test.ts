import assert from "node:assert/strict";
import { test } from "node:test";
import {
  lockPhotoViewerAxis,
  PHOTO_VIEWER_AXIS_LOCK_PX,
  photoViewerBackdropOpacity,
  photoViewerDragOffset,
  settlePhotoViewerGesture,
} from "./photoViewer";

test("lockPhotoViewerAxis stays undecided until the lock threshold", () => {
  assert.equal(lockPhotoViewerAxis(4, 3, "undecided"), "undecided");
  assert.equal(lockPhotoViewerAxis(PHOTO_VIEWER_AXIS_LOCK_PX, 2, "undecided"), "horizontal");
  assert.equal(lockPhotoViewerAxis(2, PHOTO_VIEWER_AXIS_LOCK_PX, "undecided"), "vertical");
});

test("lockPhotoViewerAxis does not switch after the axis is locked", () => {
  assert.equal(lockPhotoViewerAxis(80, 90, "horizontal"), "horizontal");
  assert.equal(lockPhotoViewerAxis(90, 10, "vertical"), "vertical");
});

test("settlePhotoViewerGesture goes next on a left swipe and prev on a right swipe", () => {
  assert.equal(
    settlePhotoViewerGesture({
      axis: "horizontal",
      dx: -80,
      dy: 4,
      vx: 0,
      vy: 0,
      canPrev: true,
      canNext: true,
    }),
    "next",
  );
  assert.equal(
    settlePhotoViewerGesture({
      axis: "horizontal",
      dx: 80,
      dy: 2,
      vx: 0,
      vy: 0,
      canPrev: true,
      canNext: true,
    }),
    "prev",
  );
});

test("settlePhotoViewerGesture rubber-bands at album edges", () => {
  assert.equal(
    settlePhotoViewerGesture({
      axis: "horizontal",
      dx: -120,
      dy: 0,
      vx: -1,
      vy: 0,
      canPrev: false,
      canNext: false,
    }),
    "stay",
  );
});

test("settlePhotoViewerGesture closes on a downward swipe only", () => {
  assert.equal(
    settlePhotoViewerGesture({
      axis: "vertical",
      dx: 2,
      dy: 120,
      vx: 0,
      vy: 0.2,
      canPrev: true,
      canNext: true,
    }),
    "close",
  );
  assert.equal(
    settlePhotoViewerGesture({
      axis: "vertical",
      dx: 0,
      dy: -140,
      vx: 0,
      vy: -1,
      canPrev: true,
      canNext: true,
    }),
    "stay",
  );
});

test("settlePhotoViewerGesture uses velocity when the distance is short", () => {
  assert.equal(
    settlePhotoViewerGesture({
      axis: "horizontal",
      dx: -20,
      dy: 0,
      vx: -0.6,
      vy: 0,
      canPrev: true,
      canNext: true,
    }),
    "next",
  );
  assert.equal(
    settlePhotoViewerGesture({
      axis: "vertical",
      dx: 0,
      dy: 30,
      vx: 0,
      vy: 0.7,
      canPrev: true,
      canNext: true,
    }),
    "close",
  );
});

test("photoViewerDragOffset damps horizontal drag at the edges and ignores upward close", () => {
  const damped = photoViewerDragOffset({
    axis: "horizontal",
    dx: -100,
    dy: 8,
    canPrev: true,
    canNext: false,
  });
  assert.equal(damped.y, 0);
  assert.ok(Math.abs(damped.x - -28) < 1e-9);
  assert.deepEqual(
    photoViewerDragOffset({
      axis: "vertical",
      dx: 12,
      dy: -40,
      canPrev: true,
      canNext: true,
    }),
    { x: 0, y: 0 },
  );
  assert.ok(photoViewerBackdropOpacity(210) < photoViewerBackdropOpacity(0));
});
