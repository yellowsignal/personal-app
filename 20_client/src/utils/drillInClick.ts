/** iOS often delivers a delayed click after a drill-in tap (~300ms). */
export const DRILL_IN_GHOST_CLICK_MS = 400;

export function isDrillInGhostClick(openedAt: number, now = Date.now()): boolean {
  if (!openedAt) return false;
  return now - openedAt < DRILL_IN_GHOST_CLICK_MS;
}
