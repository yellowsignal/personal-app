import assert from "node:assert/strict";
import { test } from "node:test";
import { LEGACY_BACKDROP_ATTR, OVERLAY_ROOT_CLASS, OVERLAY_ROOT_ID } from "./overlayRoot.ts";

test("removeLegacyBodyOverlays deletes stuck body dim nodes and keeps the app overlay root", async () => {
  const removed: string[] = [];
  const leftover = {
    getAttribute: (name: string) => (name === LEGACY_BACKDROP_ATTR ? "" : null),
    hasAttribute: () => false,
    remove() {
      removed.push("legacy");
    },
  };
  const scrim = {
    id: "",
    hasAttribute: (name: string) => name === "data-keyboard-inset",
    getAttribute: () => null,
    remove() {
      removed.push("scrim");
    },
  };
  const appRoot = {
    id: "root",
    hasAttribute: () => false,
    getAttribute: () => null,
    remove() {
      removed.push("app");
    },
  };
  const overlayRoot = {
    id: OVERLAY_ROOT_ID,
    hasAttribute: () => false,
    getAttribute: () => null,
    remove() {
      removed.push("overlay-root");
    },
  };
  (globalThis as { document?: unknown }).document = {
    getElementById: (id: string) => (id === OVERLAY_ROOT_ID ? overlayRoot : null),
    querySelectorAll: (sel: string) => (sel.includes(LEGACY_BACKDROP_ATTR) ? [leftover] : []),
    body: { children: [appRoot, scrim, overlayRoot] },
  };

  const { getOverlayRoot, removeLegacyBodyOverlays } = await import("./overlayRoot.ts");
  assert.equal(getOverlayRoot(), overlayRoot);
  removeLegacyBodyOverlays();
  assert.deepEqual(removed, ["legacy", "scrim"]);
});

test("overlay root is viewport-fixed so a long album cannot push sheets off-screen", () => {
  assert.match(OVERLAY_ROOT_CLASS, /\bfixed\b/);
  assert.match(OVERLAY_ROOT_CLASS, /\binset-0\b/);
  assert.doesNotMatch(OVERLAY_ROOT_CLASS, /\babsolute\b/);
});
