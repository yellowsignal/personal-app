import type { ReactNode } from "react";

/** Dimmed overlay that closes when the user taps outside the sheet. */
export default function OverlayScrim({
  children,
  onDismiss,
  label,
  className,
}: {
  children: ReactNode;
  onDismiss?: () => void;
  label: string;
  className: string;
}) {
  return (
    <div className={className}>
      {onDismiss ? (
        <button type="button" className="absolute inset-0 cursor-default" aria-label={label} onClick={onDismiss} />
      ) : null}
      {children}
    </div>
  );
}
