import assert from "node:assert/strict";
import { test } from "node:test";

test("resetWindowScroll sets window and document scroll to 0", async () => {
  const calls: Array<[number, number]> = [];
  const doc = {
    documentElement: { scrollTop: 120 },
    body: { scrollTop: 80 },
  };
  (globalThis as { window?: unknown; document?: unknown }).window = {
    scrollTo: (x: number, y: number) => {
      calls.push([x, y]);
    },
  };
  (globalThis as { document?: unknown }).document = doc;

  const { resetWindowScroll } = await import("./useBodyScrollLock.ts");
  resetWindowScroll();
  assert.deepEqual(calls, [[0, 0]]);
  assert.equal(doc.documentElement.scrollTop, 0);
  assert.equal(doc.body.scrollTop, 0);
});

test("scheduleResetWindowScroll resets immediately and cancels pending work", async () => {
  const calls: Array<[number, number]> = [];
  const timeouts: Array<{ id: number; fn: () => void; ms: number }> = [];
  const rafs: Array<{ id: number; fn: FrameRequestCallback }> = [];
  let nextId = 1;

  (globalThis as { window?: unknown; document?: unknown }).window = {
    scrollTo: (x: number, y: number) => {
      calls.push([x, y]);
    },
    requestAnimationFrame: (fn: FrameRequestCallback) => {
      const id = nextId++;
      rafs.push({ id, fn });
      return id;
    },
    cancelAnimationFrame: (id: number) => {
      const idx = rafs.findIndex((r) => r.id === id);
      if (idx >= 0) rafs.splice(idx, 1);
    },
    setTimeout: (fn: () => void, ms: number) => {
      const id = nextId++;
      timeouts.push({ id, fn, ms });
      return id;
    },
    clearTimeout: (id: number) => {
      const idx = timeouts.findIndex((t) => t.id === id);
      if (idx >= 0) timeouts.splice(idx, 1);
    },
  };
  (globalThis as { document?: unknown }).document = {
    documentElement: { scrollTop: 200 },
    body: { scrollTop: 200 },
  };

  const { scheduleResetWindowScroll } = await import("./useBodyScrollLock.ts");
  const cancel = scheduleResetWindowScroll();
  assert.equal(calls.length, 1);
  assert.equal(timeouts.length, 2);
  assert.equal(rafs.length, 1);

  cancel();
  assert.equal(timeouts.length, 0);
  assert.equal(rafs.length, 0);
});

test("home scroll lock does not pin body position", async () => {
  const { HOME_SCROLL_LOCK_OPTIONS } = await import("./useBodyScrollLock.ts");
  assert.equal(HOME_SCROLL_LOCK_OPTIONS.pinBody, false);
  assert.equal(HOME_SCROLL_LOCK_OPTIONS.restoreScroll, false);
});
