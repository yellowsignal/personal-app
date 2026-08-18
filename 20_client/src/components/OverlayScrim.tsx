import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { useOverlayCoverStyle } from "../hooks/useOverlayCoverStyle";
import {
  OVERLAY_SCRIM_OPACITY,
  acquireOverlayBackdrop,
  setOverlayBackdropOpacity,
} from "../utils/overlayBackdrop";
import { sheetMaxHeightPx } from "../utils/composerKeyboard";
import SwipeToDismiss from "./SwipeToDismiss";

/** Dimmed overlay that closes when the user taps outside the sheet (and optionally swipes down). */
export default function OverlayScrim({
  children,
  onDismiss,
  label,
  className,
  swipeToDismiss = true,
  lockBackground = true,
}: {
  children: ReactNode;
  onDismiss?: () => void;
  label: string;
  className: string;
  /** iOS-style swipe-down to close. Default true when onDismiss is set; disable for alert dialogs. */
  swipeToDismiss?: boolean;
  /** Freeze the page behind the overlay so only the sheet can scroll/swipe. */
  lockBackground?: boolean;
}) {
  const [dragY, setDragY] = useState(0);
  const [sheetMaxPx, setSheetMaxPx] = useState<number>(() =>
    typeof window === "undefined" ? 720 : sheetMaxHeightPx(window.innerHeight, null),
  );
  const keyboardInset = useKeyboardInset();
  const enableSwipe = Boolean(onDismiss && swipeToDismiss);
  const dim = enableSwipe
    ? Math.max(0, OVERLAY_SCRIM_OPACITY * (1 - dragY / 320))
    : OVERLAY_SCRIM_OPACITY;
  // Do not pin `body { position:fixed }` for sheets — that is what makes this
  // layer stick to the top of the document on iPhone and dim only half the page.
  useBodyScrollLock(lockBackground, { pinBody: false });
  const cover = useOverlayCoverStyle();

  useLayoutEffect(() => {
    const release = acquireOverlayBackdrop(OVERLAY_SCRIM_OPACITY);
    return release;
  }, []);

  useLayoutEffect(() => {
    setOverlayBackdropOpacity(dim);
  }, [dim]);

  useEffect(() => {
    const sync = () => {
      const vv = window.visualViewport;
      setSheetMaxPx(
        sheetMaxHeightPx(
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

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={className.replace(/\bbg-black\/\d+\b/g, "bg-transparent")}
      style={{
        ...cover,
        backgroundColor: "transparent", // dim lives on the persistent body backdrop
        overscrollBehavior: "none",
        touchAction: "none",
        paddingBottom: keyboardInset > 0 ? keyboardInset : undefined,
        ["--keyboard-inset" as string]: `${keyboardInset}px`,
        ["--sheet-max-height" as string]: `${sheetMaxPx}px`,
      }}
      data-keyboard-inset={keyboardInset}
      data-sheet-max={sheetMaxPx}
      onTouchMove={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      {onDismiss ? (
        <button
          type="button"
          className="absolute inset-0 z-0 cursor-default"
          style={{ touchAction: "none" }}
          aria-label={label}
          onClick={onDismiss}
        />
      ) : null}
      {enableSwipe ? (
        <div className="relative z-10 w-full max-w-md">
          <SwipeToDismiss onDismiss={onDismiss!} onOffsetChange={setDragY}>
            {children}
          </SwipeToDismiss>
        </div>
      ) : (
        <div className="relative z-10 w-full max-w-md" style={{ touchAction: "pan-y" }}>
          {children}
        </div>
      )}
    </div>,
    document.body,
  );
}
