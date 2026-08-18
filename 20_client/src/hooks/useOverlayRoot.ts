import { useLayoutEffect, useState } from "react";
import { releaseOverlayRoot, removeLegacyBodyOverlays, retainOverlayRoot } from "../utils/overlayRoot";

/** Portal target on document.body. Sized only while this overlay is mounted. */
export function useOverlayRoot(): HTMLElement | null {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    removeLegacyBodyOverlays();
    const el = retainOverlayRoot();
    setRoot(el);
    return () => {
      releaseOverlayRoot();
      setRoot(null);
    };
  }, []);
  return root;
}
