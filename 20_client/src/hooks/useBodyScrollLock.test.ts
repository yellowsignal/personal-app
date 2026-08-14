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
