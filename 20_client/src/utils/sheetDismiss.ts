export const SHEET_DISMISS_PX = 110;
export const SHEET_DISMISS_VELOCITY = 0.65; // px/ms
export const SHEET_MOVE_TOLERANCE_PX = 10;

/** Settle a downward sheet drag. `dy` is positive when dragging down. `velocityY` is px/ms. */
export function settleSheetDismiss(dy: number, velocityY: number): "dismiss" | "restore" {
  if (!Number.isFinite(dy) || dy <= 0) return "restore";
  if (dy >= SHEET_DISMISS_PX || (dy >= 48 && velocityY >= SHEET_DISMISS_VELOCITY)) {
    return "dismiss";
  }
  return "restore";
}

export function sheetDragResistance(dy: number): number {
  if (dy <= 0) return dy * 0.25;
  return dy;
}
