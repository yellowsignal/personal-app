import { overlayCoverStyle, type OverlayCoverBox } from "./overlayCover";

export const OVERLAY_BACKDROP_ATTR = "data-app-overlay-backdrop";
export const OVERLAY_SCRIM_OPACITY = 0.4;

type CoverStyle = ReturnType<typeof overlayCoverStyle>;

let node: HTMLDivElement | null = null;
let holders = 0;
let currentOpacity = 0;

function applyCover(el: HTMLDivElement, style?: CoverStyle): void {
  const next =
    style ??
    overlayCoverStyle({
      top: 0,
      left: 0,
      width: typeof window === "undefined" ? 390 : window.innerWidth,
      height: typeof window === "undefined" ? 844 : window.innerHeight,
    });
  el.style.position = next.position;
  el.style.top = `${next.top}px`;
  el.style.left = `${next.left}px`;
  el.style.width = `${next.width}px`;
  el.style.height = `${next.height}px`;
  el.style.right = next.right;
  el.style.bottom = next.bottom;
}

function paint(): void {
  if (!node) return;
  node.style.backgroundColor =
    currentOpacity <= 0.001 ? "transparent" : `rgba(0,0,0,${currentOpacity})`;
  node.style.pointerEvents = "none";
}

export function ensureOverlayBackdrop(): HTMLDivElement | null {
  if (typeof document === "undefined") return null;
  if (node?.isConnected) return node;
  const el = document.createElement("div");
  el.setAttribute(OVERLAY_BACKDROP_ATTR, "");
  el.setAttribute("aria-hidden", "true");
  el.style.zIndex = "20";
  el.style.pointerEvents = "none";
  el.style.backgroundColor = "transparent";
  el.style.transition = "background-color 160ms ease";
  applyCover(el);
  document.body.appendChild(el);
  node = el;
  paint();
  return el;
}

export function syncOverlayBackdropCover(box: OverlayCoverBox): void {
  const el = ensureOverlayBackdrop();
  if (!el) return;
  applyCover(el, overlayCoverStyle(box));
}

export function syncOverlayBackdropStyle(style: CoverStyle): void {
  const el = ensureOverlayBackdrop();
  if (!el) return;
  applyCover(el, style);
}

export function setOverlayBackdropOpacity(opacity: number): void {
  currentOpacity = Math.max(0, Math.min(1, opacity));
  ensureOverlayBackdrop();
  paint();
}

export function acquireOverlayBackdrop(opacity = OVERLAY_SCRIM_OPACITY): () => void {
  holders += 1;
  setOverlayBackdropOpacity(opacity);
  return releaseOverlayBackdrop;
}

export function releaseOverlayBackdrop(): void {
  holders = Math.max(0, holders - 1);
  if (holders === 0) setOverlayBackdropOpacity(0);
}

export function overlayBackdropHolderCount(): number {
  return holders;
}

export function overlayBackdropOpacity(): number {
  return currentOpacity;
}

/** Test-only: drop the persistent node and counters. */
export function resetOverlayBackdropForTests(): void {
  holders = 0;
  currentOpacity = 0;
  node?.remove();
  node = null;
}
