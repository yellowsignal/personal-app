export const OVERLAY_ROOT_ID = "app-overlay-root";
export const OVERLAY_ROOT_ACTIVE_CLASS = "is-active";
export const LEGACY_BACKDROP_ATTR = "data-app-overlay-backdrop";

/**
 * Active overlay host — CSS class applied only while a sheet/lightbox is mounted.
 * Do not leave `position:fixed` + `isolation:isolate` on an empty host.
 * iOS promotes that idle GPU layer after a pause, paints it gray, and the
 * last tapped album card (えいと) stays bright above it.
 */

let retainCount = 0;

export function getOverlayRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById(OVERLAY_ROOT_ID);
}

export function ensureOverlayRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let el = document.getElementById(OVERLAY_ROOT_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = OVERLAY_ROOT_ID;
    document.body.appendChild(el);
  }
  return el;
}

function applyOverlayHostState(el: HTMLElement, active: boolean): void {
  if (active) {
    el.classList.add(OVERLAY_ROOT_ACTIVE_CLASS);
    el.setAttribute("data-overlay-active", "true");
  } else {
    el.classList.remove(OVERLAY_ROOT_ACTIVE_CLASS);
    el.removeAttribute("data-overlay-active");
  }
}

/** Show the viewport host. Pair with `releaseOverlayRoot` on unmount. */
export function retainOverlayRoot(): HTMLElement | null {
  const el = ensureOverlayRoot();
  if (!el) return null;
  retainCount += 1;
  applyOverlayHostState(el, true);
  notifyListeners();
  return el;
}

export function releaseOverlayRoot(): void {
  retainCount = Math.max(0, retainCount - 1);
  const el = getOverlayRoot();
  if (!el) return;
  if (retainCount === 0) applyOverlayHostState(el, false);
  notifyListeners();
}

export function overlayRootRetainCount(): number {
  return retainCount;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function notifyListeners(): void {
  for (const fn of listeners) fn();
}

/** Subscribe to retain count changes. Returns unsubscribe function. */
export function subscribeOverlayActive(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// useOverlayActive hook lives in the component that needs it (BottomNav) to
// avoid importing React from a utility module.

export function resetOverlayRetainForTests(): void {
  retainCount = 0;
  const el = getOverlayRoot();
  if (el) applyOverlayHostState(el, false);
}

/** Drop compositor leftovers when leaving a page. Safe if a real overlay is still open. */
export function flattenIdleOverlayHost(): void {
  if (typeof document === "undefined") return;
  if (typeof HTMLElement !== "undefined" && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  removeLegacyBodyOverlays();
  if (retainCount !== 0) return;
  const host = getOverlayRoot();
  if (!host) return;
  applyOverlayHostState(host, false);
  while (host.firstChild) host.removeChild(host.firstChild);
}

/**
 * Previous builds left a `position:fixed` dim layer on `document.body`.
 * iOS kept it after close, covering ~100vh from the top of the document so
 * only the last album card looked bright. Remove any leftover nodes.
 */
export function removeLegacyBodyOverlays(): void {
  if (typeof document === "undefined") return;
  document.querySelectorAll(`[${LEGACY_BACKDROP_ATTR}]`).forEach((node) => node.remove());
  for (const node of Array.from(document.body.children)) {
    const el = node as HTMLElement;
    if (el.id === "root" || el.id === OVERLAY_ROOT_ID) continue;
    const leftoverScrim =
      (typeof el.hasAttribute === "function" && el.hasAttribute("data-keyboard-inset")) ||
      (typeof el.getAttribute === "function" && el.getAttribute("role") === "dialog");
    if (leftoverScrim) el.remove();
  }
  if (retainCount === 0) {
    const host = getOverlayRoot();
    if (host) applyOverlayHostState(host, false);
  }
}
