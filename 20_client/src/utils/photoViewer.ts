export type PhotoViewerAxis = "undecided" | "horizontal" | "vertical";

export type PhotoViewerGestureState = {
  axis: PhotoViewerAxis;
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  canPrev: boolean;
  canNext: boolean;
};

export type PhotoViewerSettle = "stay" | "prev" | "next" | "close";

export const PHOTO_VIEWER_AXIS_LOCK_PX = 10;
export const PHOTO_VIEWER_SWIPE_PX = 72;
export const PHOTO_VIEWER_SWIPE_VELOCITY = 0.45;
export const PHOTO_VIEWER_CLOSE_PX = 96;
export const PHOTO_VIEWER_CLOSE_VELOCITY = 0.55;
export const PHOTO_VIEWER_EDGE_DAMPING = 0.28;

export function lockPhotoViewerAxis(
  dx: number,
  dy: number,
  current: PhotoViewerAxis,
): PhotoViewerAxis {
  if (current !== "undecided") return current;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < PHOTO_VIEWER_AXIS_LOCK_PX && ay < PHOTO_VIEWER_AXIS_LOCK_PX) {
    return "undecided";
  }
  return ax >= ay ? "horizontal" : "vertical";
}

export function settlePhotoViewerGesture(state: PhotoViewerGestureState): PhotoViewerSettle {
  if (state.axis === "vertical") {
    if (state.dy > PHOTO_VIEWER_CLOSE_PX || state.vy > PHOTO_VIEWER_CLOSE_VELOCITY) {
      return "close";
    }
    return "stay";
  }

  if (state.axis === "horizontal") {
    if ((state.dx < -PHOTO_VIEWER_SWIPE_PX || state.vx < -PHOTO_VIEWER_SWIPE_VELOCITY) && state.canNext) {
      return "next";
    }
    if ((state.dx > PHOTO_VIEWER_SWIPE_PX || state.vx > PHOTO_VIEWER_SWIPE_VELOCITY) && state.canPrev) {
      return "prev";
    }
  }

  return "stay";
}

export function photoViewerDragOffset(
  state: Pick<PhotoViewerGestureState, "axis" | "dx" | "dy" | "canPrev" | "canNext">,
): { x: number; y: number } {
  if (state.axis === "vertical") {
    return { x: 0, y: Math.max(0, state.dy) };
  }
  if (state.axis === "horizontal") {
    let x = state.dx;
    if (x < 0 && !state.canNext) x *= PHOTO_VIEWER_EDGE_DAMPING;
    if (x > 0 && !state.canPrev) x *= PHOTO_VIEWER_EDGE_DAMPING;
    return { x, y: 0 };
  }
  return { x: 0, y: Math.max(0, state.dy) };
}

export function photoViewerBackdropOpacity(dy: number): number {
  return Math.max(0.18, 1 - Math.max(0, dy) / 420);
}
