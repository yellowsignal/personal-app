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

export type PhotoZoom = {
  scale: number;
  tx: number;
  ty: number;
};

export const PHOTO_VIEWER_AXIS_LOCK_PX = 10;
export const PHOTO_VIEWER_SWIPE_PX = 72;
export const PHOTO_VIEWER_SWIPE_VELOCITY = 0.45;
export const PHOTO_VIEWER_CLOSE_PX = 96;
export const PHOTO_VIEWER_CLOSE_VELOCITY = 0.55;
export const PHOTO_VIEWER_EDGE_DAMPING = 0.28;

export const PHOTO_ZOOM_MIN = 1;
export const PHOTO_ZOOM_MAX = 4;
export const PHOTO_ZOOM_DOUBLE_TAP = 2.5;
export const PHOTO_ZOOM_IDENTITY: PhotoZoom = { scale: 1, tx: 0, ty: 0 };

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

export function clampPhotoZoom(scale: number): number {
  if (!Number.isFinite(scale)) return PHOTO_ZOOM_MIN;
  return Math.min(PHOTO_ZOOM_MAX, Math.max(PHOTO_ZOOM_MIN, scale));
}

export function isPhotoZoomed(scale: number): boolean {
  return scale > 1.05;
}

export function clampPhotoPan(
  tx: number,
  ty: number,
  scale: number,
  viewportWidth: number,
  viewportHeight: number,
): { tx: number; ty: number } {
  if (scale <= 1.01 || viewportWidth <= 0 || viewportHeight <= 0) {
    return { tx: 0, ty: 0 };
  }
  const maxX = Math.max(0, (viewportWidth * scale - viewportWidth) / 2);
  const maxY = Math.max(0, (viewportHeight * scale - viewportHeight) / 2);
  return {
    tx: Math.min(maxX, Math.max(-maxX, tx)),
    ty: Math.min(maxY, Math.max(-maxY, ty)),
  };
}

/** Zoom while keeping a focal point (relative to viewport center) stable. */
export function photoZoomAtPoint(
  current: PhotoZoom,
  nextScale: number,
  focalX: number,
  focalY: number,
  viewportWidth: number,
  viewportHeight: number,
): PhotoZoom {
  const scale = clampPhotoZoom(nextScale);
  if (scale <= 1.01) return { ...PHOTO_ZOOM_IDENTITY };
  const safeCurrent = Math.max(current.scale, 0.01);
  const ratio = scale / safeCurrent;
  const tx = focalX - (focalX - current.tx) * ratio;
  const ty = focalY - (focalY - current.ty) * ratio;
  const pan = clampPhotoPan(tx, ty, scale, viewportWidth, viewportHeight);
  return { scale, tx: pan.tx, ty: pan.ty };
}

export function nextDoubleTapZoom(scale: number): number {
  return scale > 1.05 ? PHOTO_ZOOM_MIN : PHOTO_ZOOM_DOUBLE_TAP;
}

export function pinchScale(
  startScale: number,
  startDistance: number,
  currentDistance: number,
): number {
  if (!(startDistance > 0) || !(currentDistance > 0)) return clampPhotoZoom(startScale);
  return clampPhotoZoom(startScale * (currentDistance / startDistance));
}

export function pointerDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pointerMidpoint(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
