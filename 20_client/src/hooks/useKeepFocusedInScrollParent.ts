import { useEffect, type RefObject } from "react";

/**
 * Keep the focused control visible inside a scrollable sheet while the iOS
 * keyboard (visualViewport) resizes — and cancel window scroll that Safari
 * applies behind the overlay.
 */
export function useKeepFocusedInScrollParent(
  active: boolean,
  scrollParentRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!active) return;

    const sync = () => {
      const parent = scrollParentRef.current;
      if (!parent) return;

      // Safari often scrolls the page behind the sheet when the keyboard opens.
      if (window.scrollY !== 0 || document.documentElement.scrollTop !== 0) {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }

      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement)) return;
      if (!parent.contains(focused)) return;
      if (
        focused.tagName !== "INPUT" &&
        focused.tagName !== "TEXTAREA" &&
        focused.tagName !== "SELECT"
      ) {
        return;
      }

      const parentRect = parent.getBoundingClientRect();
      const fieldRect = focused.getBoundingClientRect();
      const vv = window.visualViewport;
      const visibleTop = vv ? vv.offsetTop : 0;
      const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const margin = 16;

      // Field clipped above the sheet / under the keyboard.
      const targetTop = Math.max(parentRect.top, visibleTop) + margin;
      const targetBottom = Math.min(parentRect.bottom, visibleBottom) - margin;

      if (fieldRect.top < targetTop) {
        parent.scrollTop -= targetTop - fieldRect.top;
      } else if (fieldRect.bottom > targetBottom) {
        parent.scrollTop += fieldRect.bottom - targetBottom;
      }
    };

    const onFocusIn = () => {
      window.requestAnimationFrame(() => {
        sync();
        window.setTimeout(sync, 50);
        window.setTimeout(sync, 300);
      });
    };

    sync();
    const vv = window.visualViewport;
    window.addEventListener("resize", sync);
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("resize", sync);
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [active, scrollParentRef]);
}
