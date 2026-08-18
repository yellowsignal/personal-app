export const OVERLAY_ROOT_ID = "app-overlay-root";
export const LEGACY_BACKDROP_ATTR = "data-app-overlay-backdrop";
/** Viewport-sized, not page-sized — sheets/lightbox must sit on the screen, not at the bottom of a long album. */
export const OVERLAY_ROOT_CLASS = "pointer-events-none fixed inset-0 z-50 isolate max-h-[100dvh]";

export function getOverlayRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById(OVERLAY_ROOT_ID);
}

/**
 * Previous builds left a `position:fixed` dim layer on `document.body`.
 * iOS kept it after close, covering ~100vh from the top of the document so
 * only the last album card looked bright. Remove any leftover nodes.
 */
export function removeLegacyBodyOverlays(): void {
  if (typeof document === "undefined") return;
  document.querySelectorAll(`[${LEGACY_BACKDROP_ATTR}]`).forEach((el) => el.remove());
  for (const node of Array.from(document.body.children)) {
    const el = node as HTMLElement;
    if (el.id === "root" || el.id === OVERLAY_ROOT_ID) continue;
    const leftoverScrim =
      (typeof el.hasAttribute === "function" && el.hasAttribute("data-keyboard-inset")) ||
      (typeof el.getAttribute === "function" && el.getAttribute("role") === "dialog");
    if (leftoverScrim) el.remove();
  }
}
