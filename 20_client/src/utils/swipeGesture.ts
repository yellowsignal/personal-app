export const LONG_PRESS_MS = 480;
export const MOVE_TOLERANCE_PX = 12;
export const SNAP_OPEN_PX = 72;
export const FULL_DELETE_PX = 152;
export const ACTION_WIDTH_PX = 80;

export type SwipeSettle = "closed" | "open" | "delete";

/** Decide how a left-swipe should settle. `dx` is negative when moving left. `velocityX` is px/ms. */
export function settleSwipe(dx: number, velocityX: number): SwipeSettle {
  if (!Number.isFinite(dx)) return "closed";
  if (dx <= -FULL_DELETE_PX || (dx <= -SNAP_OPEN_PX && velocityX <= -0.85)) {
    return "delete";
  }
  if (dx <= -SNAP_OPEN_PX / 2) return "open";
  return "closed";
}

export function clampSwipeOffset(next: number): number {
  if (next > 0) return next / 4;
  const min = -ACTION_WIDTH_PX * 2.4;
  return next < min ? min : next;
}
