import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  SHEET_MOVE_TOLERANCE_PX,
  settleSheetDismiss,
  sheetDragResistance,
} from "../utils/sheetDismiss";

function findScrollParent(start: HTMLElement | null, root: HTMLElement): HTMLElement {
  let node: HTMLElement | null = start;
  while (node && node !== root) {
    const style = window.getComputedStyle(node);
    const oy = style.overflowY;
    if ((oy === "auto" || oy === "scroll" || oy === "overlay") && node.scrollHeight > node.clientHeight + 1) {
      return node;
    }
    node = node.parentElement;
  }
  if (root.scrollHeight > root.clientHeight + 1) return root;
  return root;
}

export default function SwipeToDismiss({
  onDismiss,
  onOffsetChange,
  children,
}: {
  onDismiss: () => void;
  onOffsetChange?: (offset: number) => void;
  children: ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const start = useRef({ y: 0, t: 0, scrollTop: 0, fromHandle: false });
  const last = useRef({ y: 0, t: 0 });
  const mode = useRef<"undecided" | "scroll" | "dismiss">("undecided");
  const offsetRef = useRef(0);
  const ignore = useRef(false);

  function setSheetOffset(next: number) {
    offsetRef.current = next;
    setOffset(next);
    onOffsetChange?.(next);
  }

  function finishDismiss() {
    setExiting(true);
    setDragging(false);
    const h = typeof window !== "undefined" ? window.innerHeight : 800;
    setSheetOffset(Math.max(h * 0.9, offsetRef.current + 120));
    window.setTimeout(() => onDismiss(), 180);
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || exiting) return;
    if ((e.target as HTMLElement).closest("[data-sheet-dismiss-ignore]")) {
      ignore.current = true;
      return;
    }
    ignore.current = false;
    mode.current = "undecided";
    const root = rootRef.current;
    const scrollEl = root ? findScrollParent(e.target as HTMLElement, root) : null;
    const fromHandle = Boolean((e.target as HTMLElement).closest("[data-sheet-handle]"));
    start.current = {
      y: e.clientY,
      t: Date.now(),
      scrollTop: scrollEl?.scrollTop ?? 0,
      fromHandle,
    };
    last.current = { y: e.clientY, t: Date.now() };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (ignore.current || exiting) return;
    const dy = e.clientY - start.current.y;
    last.current = { y: e.clientY, t: Date.now() };

    if (mode.current === "undecided") {
      if (Math.abs(dy) < SHEET_MOVE_TOLERANCE_PX) return;
      const pullingDown = dy > 0;
      const atTop = start.current.scrollTop <= 0;
      if (start.current.fromHandle || (pullingDown && atTop)) {
        mode.current = "dismiss";
        setDragging(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      } else {
        mode.current = "scroll";
        return;
      }
    }

    if (mode.current !== "dismiss") return;
    e.preventDefault();
    setSheetOffset(sheetDragResistance(dy));
  }

  function onPointerUp() {
    if (ignore.current || exiting) {
      ignore.current = false;
      return;
    }
    if (mode.current !== "dismiss") {
      mode.current = "undecided";
      return;
    }
    const dy = offsetRef.current;
    const dt = Math.max(1, Date.now() - start.current.t);
    const velocityY = (last.current.y - start.current.y) / dt;
    setDragging(false);
    mode.current = "undecided";
    if (settleSheetDismiss(dy, velocityY) === "dismiss") {
      finishDismiss();
      return;
    }
    setSheetOffset(0);
  }

  // Block native touch scroll while pulling the sheet down to dismiss.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (mode.current === "dismiss") {
        e.preventDefault();
        return;
      }
      if (mode.current !== "undecided" || !e.touches[0]) return;
      const dy = e.touches[0].clientY - start.current.y;
      if (dy > 0 && (start.current.fromHandle || start.current.scrollTop <= 0)) {
        e.preventDefault();
      }
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  return (
    <div
      ref={rootRef}
      className="relative z-10 w-full max-w-md"
      style={{
        transform: `translate3d(0, ${Math.max(0, offset)}px, 0)`,
        transition: dragging ? "none" : "transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        touchAction: dragging ? "none" : "pan-y",
        overscrollBehavior: "contain",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        data-sheet-handle
        className="absolute inset-x-0 top-0 z-20 flex h-7 cursor-grab items-start justify-center pt-2 active:cursor-grabbing"
        style={{ touchAction: "none" }}
        aria-hidden
      >
        <div className="h-1 w-10 rounded-full bg-neutral-300" />
      </div>
      {children}
    </div>
  );
}
