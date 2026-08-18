import assert from "node:assert/strict";
import { test } from "node:test";
import { OVERLAY_BACKDROP_ATTR } from "./overlayBackdrop.ts";

type FakeEl = {
  isConnected: boolean;
  style: Record<string, string>;
  attrs: Record<string, string>;
  setAttribute: (name: string, value: string) => void;
  remove: () => void;
};

function installDom() {
  const bodyChildren: FakeEl[] = [];
  const createElement = (): FakeEl => {
    const el: FakeEl = {
      isConnected: false,
      style: {},
      attrs: {},
      setAttribute(name, value) {
        this.attrs[name] = value;
      },
      remove() {
        this.isConnected = false;
        const idx = bodyChildren.indexOf(this);
        if (idx >= 0) bodyChildren.splice(idx, 1);
      },
    };
    return el;
  };

  const previous = {
    window: (globalThis as { window?: unknown }).window,
    document: (globalThis as { document?: unknown }).document,
  };

  (globalThis as { window?: unknown }).window = {
    innerWidth: 390,
    innerHeight: 844,
  };
  (globalThis as { document?: unknown }).document = {
    body: {
      appendChild(el: FakeEl) {
        el.isConnected = true;
        bodyChildren.push(el);
        return el;
      },
    },
    createElement,
  };

  return {
    bodyChildren,
    restore() {
      (globalThis as { window?: unknown }).window = previous.window;
      (globalThis as { document?: unknown }).document = previous.document;
    },
  };
}

test("overlay backdrop stays in the DOM and turns transparent instead of unmounting", async () => {
  const dom = installDom();
  const {
    acquireOverlayBackdrop,
    overlayBackdropHolderCount,
    overlayBackdropOpacity,
    releaseOverlayBackdrop,
    resetOverlayBackdropForTests,
  } = await import("./overlayBackdrop.ts");
  resetOverlayBackdropForTests();
  try {
    const release = acquireOverlayBackdrop(0.4);
    assert.equal(overlayBackdropHolderCount(), 1);
    assert.equal(overlayBackdropOpacity(), 0.4);
    assert.equal(dom.bodyChildren.length, 1);
    assert.equal(dom.bodyChildren[0]?.attrs[OVERLAY_BACKDROP_ATTR], "");
    assert.equal(dom.bodyChildren[0]?.style.backgroundColor, "rgba(0,0,0,0.4)");

    release();
    assert.equal(overlayBackdropHolderCount(), 0);
    assert.equal(overlayBackdropOpacity(), 0);
    assert.equal(dom.bodyChildren.length, 1, "node must stay mounted");
    assert.equal(dom.bodyChildren[0]?.style.backgroundColor, "transparent");
    assert.equal(dom.bodyChildren[0]?.style.pointerEvents, "none");
  } finally {
    resetOverlayBackdropForTests();
    dom.restore();
  }
});

test("stacked overlays keep the dim until the last holder releases", async () => {
  const dom = installDom();
  const {
    acquireOverlayBackdrop,
    overlayBackdropHolderCount,
    overlayBackdropOpacity,
    resetOverlayBackdropForTests,
    setOverlayBackdropOpacity,
  } = await import("./overlayBackdrop.ts");
  resetOverlayBackdropForTests();
  try {
    const first = acquireOverlayBackdrop(0.4);
    const second = acquireOverlayBackdrop(1);
    assert.equal(overlayBackdropHolderCount(), 2);
    assert.equal(overlayBackdropOpacity(), 1);

    first();
    assert.equal(overlayBackdropHolderCount(), 1);
    assert.equal(overlayBackdropOpacity(), 1);

    setOverlayBackdropOpacity(0.2);
    assert.equal(overlayBackdropOpacity(), 0.2);

    second();
    assert.equal(overlayBackdropHolderCount(), 0);
    assert.equal(overlayBackdropOpacity(), 0);
    assert.equal(dom.bodyChildren[0]?.style.backgroundColor, "transparent");
  } finally {
    resetOverlayBackdropForTests();
    dom.restore();
  }
});
