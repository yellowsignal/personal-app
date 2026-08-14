import { useCallback, useEffect, type RefObject } from "react";
import {
  maxWindowScrollY,
  scrollYToPlaceAboveVisibleBottom,
  visualViewportBottom,
} from "../utils/composerKeyboard";

const GAP_PX = 8;

function readScroller(): HTMLElement {
  return document.scrollingElement instanceof HTMLElement
    ? document.scrollingElement
    : document.documentElement;
}

/**
 * While the checklist composer is focused, keep the last list item just above
 * the field instead of letting iOS scroll into empty page padding.
 */
export function useKeepLastItemAboveComposer(
  focused: boolean,
  listEndRef: RefObject<HTMLElement | null>,
  composerRef: RefObject<HTMLElement | null>,
  revision = 0,
) {
  const sync = useCallback(() => {
    if (!focused) return;
    const listEnd = listEndRef.current;
    const composer = composerRef.current;
    if (!listEnd || !composer) return;

    const vv = window.visualViewport;
    const visibleBottom = visualViewportBottom(
      window.innerHeight,
      vv ? { height: vv.height, offsetTop: vv.offsetTop } : null,
    );
    const scroller = readScroller();
    const next = scrollYToPlaceAboveVisibleBottom({
      elementBottomInViewport: listEnd.getBoundingClientRect().bottom,
      visibleBottom,
      marginPx: composer.getBoundingClientRect().height + GAP_PX,
      currentScrollY: window.scrollY || scroller.scrollTop,
      maxScrollY: maxWindowScrollY(scroller.scrollHeight, scroller.clientHeight),
    });
    if (Math.abs(next - (window.scrollY || scroller.scrollTop)) > 2) {
      window.scrollTo(0, next);
    }
  }, [composerRef, focused, listEndRef]);

  useEffect(() => {
    if (!focused) return;
    sync();
    const delays = [50, 200, 400].map((ms) => window.setTimeout(sync, ms));
    const vv = window.visualViewport;
    window.addEventListener("resize", sync);
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    return () => {
      for (const id of delays) window.clearTimeout(id);
      window.removeEventListener("resize", sync);
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
    };
  }, [focused, revision, sync]);
}
