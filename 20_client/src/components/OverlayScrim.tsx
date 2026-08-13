import { useState, type ReactNode } from "react";
import SwipeToDismiss from "./SwipeToDismiss";

/** Dimmed overlay that closes when the user taps outside the sheet (and optionally swipes down). */
export default function OverlayScrim({
  children,
  onDismiss,
  label,
  className,
  swipeToDismiss = true,
}: {
  children: ReactNode;
  onDismiss?: () => void;
  label: string;
  className: string;
  /** iOS-style swipe-down to close. Default true when onDismiss is set; disable for alert dialogs. */
  swipeToDismiss?: boolean;
}) {
  const [dragY, setDragY] = useState(0);
  const enableSwipe = Boolean(onDismiss && swipeToDismiss);
  const dim = enableSwipe ? Math.max(0, 0.4 * (1 - dragY / 320)) : undefined;

  return (
    <div
      className={className}
      style={dim != null ? { backgroundColor: `rgba(0,0,0,${dim})` } : undefined}
    >
      {onDismiss ? (
        <button type="button" className="absolute inset-0 cursor-default" aria-label={label} onClick={onDismiss} />
      ) : null}
      {enableSwipe ? (
        <SwipeToDismiss onDismiss={onDismiss!} onOffsetChange={setDragY}>
          {children}
        </SwipeToDismiss>
      ) : (
        children
      )}
    </div>
  );
}
