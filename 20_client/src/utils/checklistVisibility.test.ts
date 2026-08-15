import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  completedRootIds,
  filterVisibleChecklistRoots,
  isSubtreeFullyCompleted,
  type ChecklistVisibilityNode,
} from "./checklistVisibility.ts";

function node(
  id: number,
  completed: boolean,
  children: ChecklistVisibilityNode[] = [],
): ChecklistVisibilityNode {
  return { id, completedAt: completed ? "2026-08-15T00:00:00.000Z" : null, children };
}

describe("checklistVisibility", () => {
  it("detects fully completed subtrees", () => {
    assert.equal(isSubtreeFullyCompleted(node(1, true, [node(2, true)])), true);
    assert.equal(isSubtreeFullyCompleted(node(1, true, [node(2, false)])), false);
    assert.equal(isSubtreeFullyCompleted(node(1, false)), false);
  });

  it("keeps newly completed roots visible until session baseline includes them", () => {
    const roots = [node(1, false), node(2, true), node(3, true)];
    const baseline = new Set(completedRootIds([node(2, true)])); // only #2 was done on open
    // After checking #3 this visit:
    const { visibleRoots, completedRootCount } = filterVisibleChecklistRoots(
      roots,
      baseline,
      false,
    );
    assert.deepEqual(
      visibleRoots.map((n) => n.id),
      [1, 3],
    );
    assert.equal(completedRootCount, 1);
  });

  it("hides baseline-completed roots until showCompleted is on", () => {
    const roots = [node(1, false), node(2, true)];
    const baseline = new Set([2]);
    const hidden = filterVisibleChecklistRoots(roots, baseline, false);
    assert.deepEqual(
      hidden.visibleRoots.map((n) => n.id),
      [1],
    );
    const shown = filterVisibleChecklistRoots(roots, baseline, true);
    assert.deepEqual(
      shown.visibleRoots.map((n) => n.id),
      [1, 2],
    );
  });
});
