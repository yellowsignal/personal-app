import { useLayoutEffect, useState } from "react";
import { getOverlayRoot, removeLegacyBodyOverlays } from "../utils/overlayRoot";

/** Portal target inside the app shell, created after AppLayout commits. */
export function useOverlayRoot(): HTMLElement | null {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    removeLegacyBodyOverlays();
    setRoot(getOverlayRoot());
  }, []);
  return root;
}
