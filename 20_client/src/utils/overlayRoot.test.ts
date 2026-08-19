import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LEGACY_BACKDROP_ATTR,
  OVERLAY_ROOT_ACTIVE_CLASS,
  OVERLAY_ROOT_ID,
  overlayRootRetainCount,
  releaseOverlayRoot,
  removeLegacyBodyOverlays,
  resetOverlayRetainForTests,
  retainOverlayRoot,
} from "./overlayRoot.ts";

function mockOverlayEl() {
  const classes = new Set<string>();
  const attrs = new Map<string, string>();
  const children: unknown[] = [];
  return {
    id: OVERLAY_ROOT_ID,
    classList: {
      add(name: string) {
        classes.add(name);
      },
      remove(name: string) {
        classes.delete(name);
      },
      contains(name: string) {
        return classes.has(name);
      },
    },
    setAttribute(name: string, value: string) {
      attrs.set(name, value);
    },
    removeAttribute(name: string) {
      attrs.delete(name);
    },
    getAttribute(name: string) {
      return attrs.get(name) ?? null;
    },
    hasAttribute(name: string) {
      return attrs.has(name);
    },
    remove() {
      throw new Error("overlay root must not be removed");
    },
    classes,
    attrs,
    children,
    get firstChild() {
      return children[0] ?? null;
    },
    removeChild() {
      children.shift();
    },
  };
}

test("removeLegacyBodyOverlays deletes stuck body dim nodes and keeps the app overlay root", async () => {
  resetOverlayRetainForTests();
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
  const overlayRoot = mockOverlayEl();
  overlayRoot.classList.add(OVERLAY_ROOT_ACTIVE_CLASS);
  overlayRoot.setAttribute("data-overlay-active", "true");
  (globalThis as { document?: unknown }).document = {
    getElementById: (id: string) => (id === OVERLAY_ROOT_ID ? overlayRoot : null),
    querySelectorAll: (sel: string) => (sel.includes(LEGACY_BACKDROP_ATTR) ? [leftover] : []),
    body: { children: [appRoot, scrim, overlayRoot] },
  };

  removeLegacyBodyOverlays();
  assert.deepEqual(removed, ["legacy", "scrim"]);
  assert.equal(overlayRoot.classList.contains(OVERLAY_ROOT_ACTIVE_CLASS), false);
  assert.equal(overlayRoot.getAttribute("data-overlay-active"), null);
});

test("overlay host is unpositioned until retainOverlayRoot, then hidden again on last release", () => {
  resetOverlayRetainForTests();
  const overlayRoot = mockOverlayEl();
  (globalThis as { document?: unknown }).document = {
    getElementById: (id: string) => (id === OVERLAY_ROOT_ID ? overlayRoot : null),
    querySelectorAll: () => [],
    body: {
      children: [overlayRoot],
      appendChild() {
        return overlayRoot;
      },
    },
  };

  assert.equal(overlayRoot.classList.contains(OVERLAY_ROOT_ACTIVE_CLASS), false);
  retainOverlayRoot();
  retainOverlayRoot();
  assert.equal(overlayRootRetainCount(), 2);
  assert.equal(overlayRoot.classList.contains(OVERLAY_ROOT_ACTIVE_CLASS), true);
  releaseOverlayRoot();
  assert.equal(overlayRoot.classList.contains(OVERLAY_ROOT_ACTIVE_CLASS), true);
  releaseOverlayRoot();
  assert.equal(overlayRootRetainCount(), 0);
  assert.equal(overlayRoot.classList.contains(OVERLAY_ROOT_ACTIVE_CLASS), false);
  resetOverlayRetainForTests();
});

test("idle overlay host must not use isolate or an always-on fixed box", async () => {
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const dir = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(dir, "../index.css"), "utf8");
  const host = css.slice(css.indexOf("#app-overlay-root {"), css.indexOf("#app-overlay-root.is-active"));
  assert.match(host, /display:\s*none/);
  assert.doesNotMatch(host, /isolate/);
  assert.doesNotMatch(host, /position:\s*fixed/);
  assert.match(css, /#app-overlay-root\.is-active/);
  assert.doesNotMatch(css, /#app-overlay-root\.is-active[\s\S]*\bisolate\b/);
});

test("flattenIdleOverlayHost clears leftover children when nothing is retained", async () => {
  const { flattenIdleOverlayHost } = await import("./overlayRoot.ts");
  resetOverlayRetainForTests();
  const overlayRoot = mockOverlayEl();
  overlayRoot.children.push({ id: "stuck-scrim" });
  overlayRoot.classList.add(OVERLAY_ROOT_ACTIVE_CLASS);
  (globalThis as { document?: unknown }).document = {
    activeElement: null,
    getElementById: (id: string) => (id === OVERLAY_ROOT_ID ? overlayRoot : null),
    querySelectorAll: () => [],
    body: { children: [overlayRoot] },
  };
  flattenIdleOverlayHost();
  assert.equal(overlayRoot.children.length, 0);
  assert.equal(overlayRoot.classList.contains(OVERLAY_ROOT_ACTIVE_CLASS), false);
  resetOverlayRetainForTests();
});
