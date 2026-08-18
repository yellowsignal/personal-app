export type OverlayCoverBox = {
  top: number;
  left: number;
  width: number;
  height: number;
};

/**
 * iOS Safari treats `position:fixed` overlays as `absolute` relative to `body`
 * when the scroll lock sets `body { position: fixed; top: -scrollY }`.
 * A naive `inset: 0` then covers 100vh from the top of the document, so the
 * visible viewport is only partly dimmed (top dark, bottom of the page bright)
 * and the leftover layer follows you to other screens.
 *
 * Offset the overlay by the pin (`-body.top`) so it always matches the screen.
 */
export function overlayCoverBox(input: {
  bodyPosition: string;
  bodyTopPx: number;
  viewportWidth: number;
  viewportHeight: number;
  visualOffsetTop?: number;
  visualOffsetLeft?: number;
}): OverlayCoverBox {
  const pinned = input.bodyPosition === "fixed";
  const pinShift = pinned ? Math.max(0, -input.bodyTopPx) : 0;
  return {
    top: pinShift + Math.max(0, input.visualOffsetTop ?? 0),
    left: Math.max(0, input.visualOffsetLeft ?? 0),
    width: Math.max(0, input.viewportWidth),
    height: Math.max(0, input.viewportHeight),
  };
}

export function overlayCoverStyle(box: OverlayCoverBox): {
  position: "fixed";
  top: number;
  left: number;
  width: number;
  height: number;
  right: "auto";
  bottom: "auto";
} {
  return {
    position: "fixed",
    top: box.top,
    left: box.left,
    width: box.width,
    height: box.height,
    right: "auto",
    bottom: "auto",
  };
}
