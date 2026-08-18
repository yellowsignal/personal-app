import assert from "node:assert/strict";
import { test } from "node:test";
import { overlayCoverBox, overlayCoverStyle } from "./overlayCover";

test("overlayCoverBox fills the screen when the body is not pinned", () => {
  assert.deepEqual(
    overlayCoverBox({
      bodyPosition: "static",
      bodyTopPx: 0,
      viewportWidth: 390,
      viewportHeight: 844,
    }),
    { top: 0, left: 0, width: 390, height: 844 },
  );
});

test("overlayCoverBox shifts down by the body pin so a scrolled page is fully dimmed", () => {
  const box = overlayCoverBox({
    bodyPosition: "fixed",
    bodyTopPx: -320,
    viewportWidth: 390,
    viewportHeight: 700,
  });
  assert.deepEqual(box, { top: 320, left: 0, width: 390, height: 700 });
  const style = overlayCoverStyle(box);
  assert.equal(style.top, 320);
  assert.equal(style.height, 700);
  assert.equal(style.right, "auto");
});

test("overlayCoverBox follows the visual viewport when the keyboard is open", () => {
  assert.deepEqual(
    overlayCoverBox({
      bodyPosition: "static",
      bodyTopPx: 0,
      viewportWidth: 390,
      viewportHeight: 480,
      visualOffsetTop: 0,
      visualOffsetLeft: 0,
    }),
    { top: 0, left: 0, width: 390, height: 480 },
  );
});
