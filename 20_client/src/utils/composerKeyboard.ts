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
