/** Checklist tree node shape used for completed-root visibility. */
export type ChecklistVisibilityNode = {
  id: number;
  completedAt: string | null;
  children: ChecklistVisibilityNode[];
};

export function isSubtreeFullyCompleted(node: ChecklistVisibilityNode): boolean {
  if (!node.completedAt) return false;
  return node.children.every(isSubtreeFullyCompleted);
}

/** Root ids that are fully completed (eligible to hide behind “show completed”). */
export function completedRootIds(roots: ChecklistVisibilityNode[]): number[] {
  return roots.filter(isSubtreeFullyCompleted).map((n) => n.id);
}

/**
 * Hide fully-completed roots that were already done when the detail session started.
 * Roots completed during this visit stay visible until the user leaves and re-opens.
 */
export function filterVisibleChecklistRoots<T extends ChecklistVisibilityNode>(
  roots: T[],
  sessionHiddenIds: ReadonlySet<number>,
  showCompletedRoots: boolean,
): { visibleRoots: T[]; completedRootCount: number } {
  const completed = roots.filter(isSubtreeFullyCompleted);
  const hiddenNow = completed.filter((n) => sessionHiddenIds.has(n.id));
  if (showCompletedRoots) {
    return { visibleRoots: roots, completedRootCount: hiddenNow.length };
  }
  const visibleRoots = roots.filter(
    (n) => !isSubtreeFullyCompleted(n) || !sessionHiddenIds.has(n.id),
  );
  return { visibleRoots, completedRootCount: hiddenNow.length };
}
