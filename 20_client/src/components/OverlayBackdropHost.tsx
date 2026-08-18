import { useLayoutEffect } from "react";
import { useOverlayCoverStyle } from "../hooks/useOverlayCoverStyle";
import { syncOverlayBackdropStyle } from "../utils/overlayBackdrop";

/**
 * Keep one full-screen dim layer on `document.body` for the whole app session.
 * Sheets/lightbox change its opacity instead of mounting a new black overlay,
 * which is what left a dark band on iPhone after closing.
 */
export default function OverlayBackdropHost() {
  const cover = useOverlayCoverStyle();

  useLayoutEffect(() => {
    syncOverlayBackdropStyle(cover);
  }, [cover]);

  return null;
}
