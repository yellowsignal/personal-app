import { useEffect, useLayoutEffect } from "react";

let lockCount = 0;
let savedScrollY = 0;
let restoreOnUnlock = true;
let savedStyles: {
  overflow: string;
  position: string;
  top: string;
  left: string;
  width: string;
  paddingRight: string;
  htmlOverflow: string;
} | null = null;

export function resetWindowScroll(): void {
  if (typeof window === "undefined") return;
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

/**
 * SPA views often keep window scroll across route or in-page drill-downs.
 * Reset now and again on the next frames/timeouts so iOS layout settles at the top.
 */
export function scheduleResetWindowScroll(): () => void {
  if (typeof window === "undefined") return () => {};
  resetWindowScroll();
  let raf2 = 0;
  const raf1 = window.requestAnimationFrame(() => {
    resetWindowScroll();
    raf2 = window.requestAnimationFrame(resetWindowScroll);
  });
  const t0 = window.setTimeout(resetWindowScroll, 0);
  const t1 = window.setTimeout(resetWindowScroll, 50);
  return () => {
    window.cancelAnimationFrame(raf1);
    window.cancelAnimationFrame(raf2);
    window.clearTimeout(t0);
    window.clearTimeout(t1);
  };
}

/** Reset window scroll whenever `key` changes (route pathname, album id, checklist id, …). */
export function useResetWindowScroll(key: unknown): void {
  useEffect(() => scheduleResetWindowScroll(), [key]);
}

function lockBody(options?: { restoreScroll?: boolean; pinBody?: boolean }) {
  if (typeof document === "undefined") return;
  lockCount += 1;
  const pinBody = options?.pinBody === true;
  if (lockCount !== 1) {
    if (pinBody && savedStyles && document.body.style.position !== "fixed") {
      applyBodyPin(options?.restoreScroll !== false);
    }
    return;
  }

  const body = document.body;
  const html = document.documentElement;
  restoreOnUnlock = options?.restoreScroll !== false;
  savedScrollY = restoreOnUnlock ? window.scrollY || html.scrollTop || 0 : 0;
  if (!restoreOnUnlock) {
    resetWindowScroll();
  }
  savedStyles = {
    overflow: body.style.overflow,
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    width: body.style.width,
    paddingRight: body.style.paddingRight,
    htmlOverflow: html.style.overflow,
  };

  const scrollbarGap = window.innerWidth - html.clientWidth;
  body.style.overflow = "hidden";
  // Do not set `html { overflow:hidden }` — iOS then treats `position:fixed`
  // overlays as document-absolute and can leave a dark band after unmount.
  html.style.overscrollBehavior = "none";
  if (scrollbarGap > 0) {
    body.style.paddingRight = `${scrollbarGap}px`;
  }
  if (pinBody) {
    applyBodyPin(restoreOnUnlock);
  }
}

function applyBodyPin(restoreScroll: boolean) {
  const body = document.body;
  restoreOnUnlock = restoreScroll;
  if (restoreScroll) {
    savedScrollY = window.scrollY || document.documentElement.scrollTop || savedScrollY;
  } else {
    savedScrollY = 0;
    resetWindowScroll();
  }
  body.style.position = "fixed";
  body.style.top = restoreScroll ? `-${savedScrollY}px` : "0";
  body.style.left = "0";
  body.style.width = "100%";
}

function unlockBody() {
  if (typeof document === "undefined") return;
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount !== 0 || !savedStyles) return;

  const body = document.body;
  const html = document.documentElement;
  const shouldRestore = restoreOnUnlock;
  const y = savedScrollY;
  body.style.overflow = savedStyles.overflow;
  body.style.position = savedStyles.position;
  body.style.top = savedStyles.top;
  body.style.left = savedStyles.left;
  body.style.width = savedStyles.width;
  body.style.paddingRight = savedStyles.paddingRight;
  html.style.overflow = savedStyles.htmlOverflow;
  html.style.overscrollBehavior = "";
  savedStyles = null;
  restoreOnUnlock = true;
  savedScrollY = 0;
  if (shouldRestore) {
    window.scrollTo(0, y);
  } else {
    resetWindowScroll();
  }
}

export type BodyScrollLockOptions = {
  /** When false, unlock always returns to the top (used for the home fixed viewport). Default true. */
  restoreScroll?: boolean;
  /**
   * When true, pin `body` with `position:fixed`. Default false — pinning makes iOS
   * treat overlays as document-absolute, so the album list stays gray except the
   * last tapped card (えいと) after tapping Home.
   */
  pinBody?: boolean;
};

/** Home already uses a 100dvh overflow-hidden shell. Do not pin `body`. */
export const HOME_SCROLL_LOCK_OPTIONS: BodyScrollLockOptions = {
  restoreScroll: false,
  pinBody: false,
};

/** Lock page scroll while a modal/sheet is open (ref-counted for stacked overlays). */
export function useBodyScrollLock(active = true, options: BodyScrollLockOptions = {}) {
  const restoreScroll = options.restoreScroll !== false;
  const pinBody = options.pinBody === true;
  useLayoutEffect(() => {
    if (!active) return;
    lockBody({ restoreScroll, pinBody });
    return () => unlockBody();
  }, [active, restoreScroll, pinBody]);
}
