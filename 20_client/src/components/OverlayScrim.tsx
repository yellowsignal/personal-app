import { useEffect, useState, type ReactNode } from "react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
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
  const dim = enableSwipe ? Math.max(0, 0.4 * (1 - dragY / 320)) : undefined;
  useBodyScrollLock(lockBackground);

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

  return (
    <div
      className={className}
      style={{
        ...(dim != null ? { backgroundColor: `rgba(0,0,0,${dim})` } : null),
        overscrollBehavior: "none",
        touchAction: "none",
        // Lift bottom sheets above the software keyboard (iOS Safari / PWA).
        paddingBottom: keyboardInset > 0 ? keyboardInset : undefined,
        ["--keyboard-inset" as string]: `${keyboardInset}px`,
        // Forms use max-h-[var(--sheet-max-height)] so tall sheets shrink with the keyboard.
        ["--sheet-max-height" as string]: `${sheetMaxPx}px`,
      }}
      data-keyboard-inset={keyboardInset}
      data-sheet-max={sheetMaxPx}
      onTouchMove={(e) => {
        // Stop iOS scroll chaining into the page behind the sheet.
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
    </div>
  );
}
