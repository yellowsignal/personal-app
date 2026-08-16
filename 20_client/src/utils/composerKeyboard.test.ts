import assert from "node:assert/strict";
import { test } from "node:test";
import {
  keyboardOverlapPx,
  maxWindowScrollY,
  scrollTopDeltaToRevealField,
  scrollYToPlaceAboveVisibleBottom,
  sheetMaxHeightPx,
  visualViewportBottom,
} from "./composerKeyboard";

test("visualViewportBottom uses offsetTop + height when the keyboard is open", () => {
  assert.equal(visualViewportBottom(800, null), 800);
  assert.equal(visualViewportBottom(800, { height: 500, offsetTop: 0 }), 500);
  assert.equal(visualViewportBottom(800, { height: 480, offsetTop: 40 }), 520);
});

test("keyboardOverlapPx is zero when closed and positive when the visual viewport shrinks", () => {
  assert.equal(keyboardOverlapPx(800, null), 0);
  assert.equal(keyboardOverlapPx(800, { height: 800, offsetTop: 0 }), 0);
  assert.equal(keyboardOverlapPx(800, { height: 500, offsetTop: 0 }), 300);
});

test("scrollYToPlaceAboveVisibleBottom keeps a short list at the top", () => {
  assert.equal(
    scrollYToPlaceAboveVisibleBottom({
      elementBottomInViewport: 240,
      visibleBottom: 500,
      marginPx: 64,
      currentScrollY: 0,
      maxScrollY: 0,
    }),
    0,
  );
});

test("scrollYToPlaceAboveVisibleBottom scrolls so the last item sits just above the composer", () => {
  assert.equal(
    scrollYToPlaceAboveVisibleBottom({
      elementBottomInViewport: 700,
      visibleBottom: 500,
      marginPx: 80,
      currentScrollY: 40,
      maxScrollY: 2000,
    }),
    320,
  );
});

test("scrollYToPlaceAboveVisibleBottom pulls back when iOS overscrolled into empty padding", () => {
  assert.equal(
    scrollYToPlaceAboveVisibleBottom({
      elementBottomInViewport: 80,
      visibleBottom: 500,
      marginPx: 80,
      currentScrollY: 900,
      maxScrollY: 1200,
    }),
    560,
  );
});

test("scrollYToPlaceAboveVisibleBottom clamps to the page bounds", () => {
  assert.equal(
    scrollYToPlaceAboveVisibleBottom({
      elementBottomInViewport: 2000,
      visibleBottom: 500,
      marginPx: 80,
      currentScrollY: 0,
      maxScrollY: 120,
    }),
    120,
  );
  assert.equal(maxWindowScrollY(900, 800), 100);
  assert.equal(maxWindowScrollY(500, 800), 0);
});

test("sheetMaxHeightPx follows the visual viewport above the keyboard", () => {
  assert.equal(sheetMaxHeightPx(800, null), 788);
  assert.equal(sheetMaxHeightPx(800, { height: 500, offsetTop: 0 }), 488);
  assert.equal(sheetMaxHeightPx(800, { height: 200, offsetTop: 0 }, 12), 240);
});

test("scrollTopDeltaToRevealField scrolls when the field sits under the keyboard", () => {
  assert.equal(
    scrollTopDeltaToRevealField({
      parentTop: 100,
      parentBottom: 700,
      fieldTop: 620,
      fieldBottom: 680,
      visibleTop: 0,
      visibleBottom: 500,
    }),
    196,
  );
});

test("scrollTopDeltaToRevealField scrolls up when Safari jumped past the field", () => {
  assert.equal(
    scrollTopDeltaToRevealField({
      parentTop: 100,
      parentBottom: 700,
      fieldTop: 40,
      fieldBottom: 90,
      visibleTop: 0,
      visibleBottom: 500,
    }),
    -76,
  );
});

test("scrollTopDeltaToRevealField is zero when the field is already visible", () => {
  assert.equal(
    scrollTopDeltaToRevealField({
      parentTop: 100,
      parentBottom: 700,
      fieldTop: 200,
      fieldBottom: 250,
      visibleTop: 0,
      visibleBottom: 500,
    }),
    0,
  );
});
