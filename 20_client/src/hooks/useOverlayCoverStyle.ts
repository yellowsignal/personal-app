import { useLayoutEffect, useState } from "react";
import { overlayCoverBox, overlayCoverStyle, type OverlayCoverBox } from "../utils/overlayCover";

function readBox(): OverlayCoverBox {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { top: 0, left: 0, width: 390, height: 844 };
  }
  const body = document.body;
  const vv = window.visualViewport;
  return overlayCoverBox({
    bodyPosition: body.style.position || window.getComputedStyle(body).position,
    bodyTopPx: Number.parseFloat(body.style.top || "0") || 0,
    viewportWidth: vv?.width ?? window.innerWidth,
    viewportHeight: vv?.height ?? window.innerHeight,
    visualOffsetTop: vv?.offsetTop ?? 0,
    visualOffsetLeft: vv?.offsetLeft ?? 0,
  });
}

/** Keep a full-screen overlay aligned with the visible screen on iOS scroll-lock. */
export function useOverlayCoverStyle() {
  const [box, setBox] = useState<OverlayCoverBox>(readBox);

  useLayoutEffect(() => {
    const sync = () => setBox(readBox());
    sync();
    window.addEventListener("resize", sync);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    return () => {
      window.removeEventListener("resize", sync);
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
    };
  }, []);

  return overlayCoverStyle(box);
}
