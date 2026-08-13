import { useState, type ReactNode } from "react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
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
  const enableSwipe = Boolean(onDismiss && swipeToDismiss);
  const dim = enableSwipe ? Math.max(0, 0.4 * (1 - dragY / 320)) : undefined;
  useBodyScrollLock(lockBackground);

  return (
    <div
      className={className}
      style={{
        ...(dim != null ? { backgroundColor: `rgba(0,0,0,${dim})` } : null),
        overscrollBehavior: "none",
        touchAction: "none",
      }}
      onTouchMove={(e) => {
        // Stop iOS scroll chaining into the page behind the sheet.
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      {onDismiss ? (
        <button
          type="button"
          className="absolute inset-0 cursor-default"
          style={{ touchAction: "none" }}
          aria-label={label}
          onClick={onDismiss}
        />
      ) : null}
      {enableSwipe ? (
        <SwipeToDismiss onDismiss={onDismiss!} onOffsetChange={setDragY}>
          {children}
        </SwipeToDismiss>
      ) : (
        <div className="relative z-10 w-full max-w-md" style={{ touchAction: "pan-y" }}>
          {children}
        </div>
      )}
    </div>
  );
}
