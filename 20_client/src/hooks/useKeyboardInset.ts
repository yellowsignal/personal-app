import { useEffect, useState } from "react";
import { keyboardOverlapPx } from "../utils/composerKeyboard";

/**
 * Software-keyboard overlap in CSS pixels (layout viewport), via visualViewport.
 * 0 when the keyboard is closed or visualViewport is unavailable.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const sync = () => {
      const vv = window.visualViewport;
      setInset(
        keyboardOverlapPx(
          window.innerHeight,
          vv ? { height: vv.height, offsetTop: vv.offsetTop } : null,
        ),
      );
    };
    sync();
    const vv = window.visualViewport;
    window.addEventListener("resize", sync);
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    return () => {
      window.removeEventListener("resize", sync);
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
    };
  }, []);

  return inset;
}
