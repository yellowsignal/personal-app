export type VisualViewportBox = {
  height: number;
  offsetTop: number;
};

/** Bottom edge of the visual viewport, in layout-viewport coordinates. */
export function visualViewportBottom(
  layoutHeight: number,
  vv: VisualViewportBox | null | undefined,
): number {
  if (!vv) return layoutHeight;
  return vv.offsetTop + vv.height;
}

/** How much the software keyboard covers the layout viewport. */
export function keyboardOverlapPx(
  layoutHeight: number,
  vv: VisualViewportBox | null | undefined,
): number {
  if (!vv) return 0;
  return Math.max(0, layoutHeight - (vv.offsetTop + vv.height));
}

/**
 * Window scrollY so `elementBottom` in the viewport sits `marginPx` above
 * `visibleBottom` (usually the visual viewport bottom). Clamped to the page.
 */
export function scrollYToPlaceAboveVisibleBottom(opts: {
  elementBottomInViewport: number;
  visibleBottom: number;
  marginPx: number;
  currentScrollY: number;
  maxScrollY: number;
}): number {
  const target = opts.visibleBottom - Math.max(0, opts.marginPx);
  const delta = opts.elementBottomInViewport - target;
  const next = opts.currentScrollY + delta;
  const max = Math.max(0, opts.maxScrollY);
  return Math.min(Math.max(0, next), max);
}

export function maxWindowScrollY(
  scrollHeight: number,
  clientHeight: number,
): number {
  return Math.max(0, scrollHeight - clientHeight);
}

/** Cap a bottom sheet to the visible viewport (above the software keyboard). */
export function sheetMaxHeightPx(
  layoutHeight: number,
  vv: VisualViewportBox | null | undefined,
  marginPx = 12,
): number {
  const h = vv ? vv.height : layoutHeight;
  return Math.max(240, Math.floor(h - Math.max(0, marginPx)));
}

/**
 * How much to change scrollTop so `field` stays inside the visible band of
 * `parent` (intersection with the visual viewport), with `marginPx` padding.
 */
export function scrollTopDeltaToRevealField(opts: {
  parentTop: number;
  parentBottom: number;
  fieldTop: number;
  fieldBottom: number;
  visibleTop: number;
  visibleBottom: number;
  marginPx?: number;
}): number {
  const margin = opts.marginPx ?? 16;
  const targetTop = Math.max(opts.parentTop, opts.visibleTop) + margin;
  const targetBottom = Math.min(opts.parentBottom, opts.visibleBottom) - margin;
  if (opts.fieldTop < targetTop) return opts.fieldTop - targetTop;
  if (opts.fieldBottom > targetBottom) return opts.fieldBottom - targetBottom;
  return 0;
}
