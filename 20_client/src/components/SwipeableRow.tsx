import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import {
  ACTION_WIDTH_PX,
  LONG_PRESS_MS,
  MOVE_TOLERANCE_PX,
  clampSwipeOffset,
  settleSwipe,
} from "../utils/swipeGesture";

function vibrateLight() {
  try {
    navigator.vibrate?.(10);
  } catch {
    /* ignore */
  }
}

export default function SwipeableRow({
  children,
  onPress,
  onLongPress,
  onDelete,
  deleteLabel,
  canDelete = true,
  actionOpen = false,
  onActionOpenChange,
  className = "",
}: {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  onDelete?: () => void;
  deleteLabel: string;
  canDelete?: boolean;
  actionOpen?: boolean;
  onActionOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const [offset, setOffset] = useState(actionOpen ? -ACTION_WIDTH_PX : 0);
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, y: 0, t: 0, offset: 0 });
  const last = useRef({ x: 0, t: 0 });
  const draggingRef = useRef(false);
  const ignoreRef = useRef(false);
  const longPressFired = useRef(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!draggingRef.current) setOffset(actionOpen ? -ACTION_WIDTH_PX : 0);
  }, [actionOpen]);

  function clearTimer() {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-swipe-ignore]")) {
      ignoreRef.current = true;
      return;
    }
    ignoreRef.current = false;
    longPressFired.current = false;
    draggingRef.current = false;
    setDragging(false);
    start.current = { x: e.clientX, y: e.clientY, t: Date.now(), offset };
    last.current = { x: e.clientX, t: Date.now() };
    clearTimer();
    timer.current = window.setTimeout(() => {
      if (draggingRef.current || ignoreRef.current) return;
      longPressFired.current = true;
      vibrateLight();
      onActionOpenChange?.(false);
      setOffset(0);
      onLongPress?.();
    }, LONG_PRESS_MS);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (ignoreRef.current || longPressFired.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    last.current = { x: e.clientX, t: Date.now() };

    if (!draggingRef.current) {
      if (Math.hypot(dx, dy) < MOVE_TOLERANCE_PX) return;
      clearTimer();
      if (Math.abs(dy) >= Math.abs(dx)) {
        ignoreRef.current = true;
        return;
      }
      if (!canDelete) {
        ignoreRef.current = true;
        return;
      }
      if (dx > 8 && !actionOpen) {
        ignoreRef.current = true;
        return;
      }
      draggingRef.current = true;
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }

    const next = clampSwipeOffset(start.current.offset + dx);
    setOffset(next);
  }

  function finishPointer(e: PointerEvent<HTMLDivElement>) {
    clearTimer();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (longPressFired.current) {
      draggingRef.current = false;
      setDragging(false);
      return;
    }
    if (!draggingRef.current) {
      if (ignoreRef.current) return;
      const dist = Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y);
      if (dist < MOVE_TOLERANCE_PX) {
        if (actionOpen || offset < -24) {
          onActionOpenChange?.(false);
          setOffset(0);
        } else {
          onPress?.();
        }
      }
      return;
    }

    const dt = Math.max(1, Date.now() - last.current.t);
    const vx = (e.clientX - last.current.x) / dt;
    const result = settleSwipe(offset, vx);
    draggingRef.current = false;
    setDragging(false);
    if (result === "delete") {
      setOffset(0);
      onActionOpenChange?.(false);
      onDelete?.();
      return;
    }
    if (result === "open") {
      setOffset(-ACTION_WIDTH_PX);
      onActionOpenChange?.(true);
      return;
    }
    setOffset(0);
    onActionOpenChange?.(false);
  }

  return (
    <div className={`relative ${className}`}>
      {canDelete && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div className="absolute inset-y-0 right-0 flex w-20 items-stretch justify-center bg-rose-500">
            <button
              type="button"
              data-swipe-ignore
              tabIndex={actionOpen || offset < -40 ? 0 : -1}
              onClick={() => {
                onActionOpenChange?.(false);
                setOffset(0);
                onDelete?.();
              }}
              className="pointer-events-auto flex w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold text-white"
              aria-label={deleteLabel}
            >
              <Trash2 size={18} />
              {deleteLabel}
            </button>
          </div>
        </div>
      )}
      <div
        role={onPress || onLongPress ? "button" : undefined}
        tabIndex={onPress || onLongPress ? 0 : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={(e) => {
          ignoreRef.current = true;
          finishPointer(e);
        }}
        onContextMenu={(e) => {
          if (onLongPress) {
            e.preventDefault();
            if (!longPressFired.current) {
              longPressFired.current = true;
              clearTimer();
              vibrateLight();
              onActionOpenChange?.(false);
              setOffset(0);
              onLongPress();
            }
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPress?.();
          }
        }}
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? "none" : "transform 0.22s ease",
          touchAction: "pan-y",
        }}
        className="relative cursor-pointer rounded-2xl bg-white shadow-sm ring-1 ring-black/5"
      >
        {children}
      </div>
    </div>
  );
}
