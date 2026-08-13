import { useEffect } from "react";

let lockCount = 0;
let savedScrollY = 0;
let savedStyles: {
  overflow: string;
  position: string;
  top: string;
  left: string;
  width: string;
  paddingRight: string;
} | null = null;

function lockBody() {
  if (typeof document === "undefined") return;
  lockCount += 1;
  if (lockCount !== 1) return;

  const body = document.body;
  const html = document.documentElement;
  savedScrollY = window.scrollY || html.scrollTop || 0;
  savedStyles = {
    overflow: body.style.overflow,
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    width: body.style.width,
    paddingRight: body.style.paddingRight,
  };

  const scrollbarGap = window.innerWidth - html.clientWidth;
  body.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${savedScrollY}px`;
  body.style.left = "0";
  body.style.width = "100%";
  if (scrollbarGap > 0) {
    body.style.paddingRight = `${scrollbarGap}px`;
  }
  html.style.overscrollBehavior = "none";
}

function unlockBody() {
  if (typeof document === "undefined") return;
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount !== 0 || !savedStyles) return;

  const body = document.body;
  const html = document.documentElement;
  body.style.overflow = savedStyles.overflow;
  body.style.position = savedStyles.position;
  body.style.top = savedStyles.top;
  body.style.left = savedStyles.left;
  body.style.width = savedStyles.width;
  body.style.paddingRight = savedStyles.paddingRight;
  html.style.overscrollBehavior = "";
  savedStyles = null;
  window.scrollTo(0, savedScrollY);
}

/** Lock page scroll while a modal/sheet is open (ref-counted for stacked overlays). */
export function useBodyScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    lockBody();
    return () => unlockBody();
  }, [active]);
}
