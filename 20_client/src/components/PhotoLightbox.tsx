import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useOverlayCoverStyle } from "../hooks/useOverlayCoverStyle";
import { useLanguage } from "../i18n/LanguageContext";
import type { IcloudAlbumPhoto } from "../api/photos";
import {
  PHOTO_ZOOM_IDENTITY,
  clampPhotoPan,
  isPhotoZoomed,
  lockPhotoViewerAxis,
  nextDoubleTapZoom,
  photoViewerBackdropOpacity,
  photoViewerDragOffset,
  photoZoomAtPoint,
  pinchScale,
  pointerDistance,
  pointerMidpoint,
  settlePhotoViewerGesture,
  type PhotoViewerAxis,
  type PhotoZoom,
} from "../utils/photoViewer";

const SETTLE_MS = 200;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 36;
const MOVE_EPS = 6;

type Point = { x: number; y: number };

export default function PhotoLightbox({
  photos,
  index,
  albumTitle,
  onIndexChange,
  onClose,
  onDownload,
  downloading = false,
}: {
  photos: IcloudAlbumPhoto[];
  index: number;
  albumTitle?: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onDownload?: () => void;
  downloading?: boolean;
}) {
  const { t } = useLanguage();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const axis = useRef<PhotoViewerAxis>("undecided");
  const start = useRef({ x: 0, y: 0, t: 0 });
  const last = useRef({ x: 0, y: 0, t: 0 });
  const ignore = useRef(false);
  const busy = useRef(false);
  const pointers = useRef<Map<number, Point>>(new Map());
  const zoomRef = useRef<PhotoZoom>({ ...PHOTO_ZOOM_IDENTITY });
  const panOrigin = useRef<PhotoZoom>({ ...PHOTO_ZOOM_IDENTITY });
  const pinch = useRef<{
    startDistance: number;
    startZoom: PhotoZoom;
    startMid: Point;
  } | null>(null);
  const moved = useRef(false);
  const activePointer = useRef<number | null>(null);
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);

  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [zoom, setZoom] = useState<PhotoZoom>({ ...PHOTO_ZOOM_IDENTITY });
  const [viewportW, setViewportW] = useState(() =>
    typeof window === "undefined" ? 390 : window.innerWidth,
  );
  const [viewportH, setViewportH] = useState(() =>
    typeof window === "undefined" ? 844 : window.innerHeight,
  );

  const photo = photos[index];
  const canPrev = index > 0;
  const canNext = index < photos.length - 1;
  const zoomed = isPhotoZoomed(zoom.scale);
  const cover = useOverlayCoverStyle();
  const offset = dragging && !zoomed
    ? photoViewerDragOffset({
        axis: axis.current,
        dx,
        dy,
        canPrev,
        canNext,
      })
    : { x: dx, y: Math.max(0, dy) };

  useBodyScrollLock(true, { pinBody: false });

  const applyZoom = useCallback((next: PhotoZoom) => {
    zoomRef.current = next;
    setZoom(next);
  }, []);

  const resetZoom = useCallback(() => {
    applyZoom({ ...PHOTO_ZOOM_IDENTITY });
  }, [applyZoom]);

  useEffect(() => {
    resetZoom();
    setDx(0);
    setDy(0);
    setDragging(false);
    axis.current = "undecided";
    pinch.current = null;
    pointers.current.clear();
    moved.current = false;
    activePointer.current = null;
  }, [index, resetZoom]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const sync = () => {
      setViewportW(el.clientWidth || window.innerWidth);
      setViewportH(el.clientHeight || window.innerHeight);
    };
    sync();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    observer?.observe(el);
    window.addEventListener("resize", sync);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);

  const closeWithMotion = useCallback(() => {
    if (busy.current || exiting) return;
    busy.current = true;
    setExiting(true);
    setDragging(false);
    setDx(0);
    setDy(typeof window !== "undefined" ? window.innerHeight : 800);
    window.setTimeout(() => onClose(), SETTLE_MS);
  }, [exiting, onClose]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (busy.current || exiting) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeWithMotion();
        return;
      }
      if (e.key === "ArrowRight" && canNext && !isPhotoZoomed(zoomRef.current.scale)) {
        e.preventDefault();
        onIndexChange(index + 1);
      }
      if (e.key === "ArrowLeft" && canPrev && !isPhotoZoomed(zoomRef.current.scale)) {
        e.preventDefault();
        onIndexChange(index - 1);
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        applyZoom(
          photoZoomAtPoint(zoomRef.current, zoomRef.current.scale + 0.35, 0, 0, viewportW, viewportH),
        );
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        applyZoom(
          photoZoomAtPoint(zoomRef.current, zoomRef.current.scale - 0.35, 0, 0, viewportW, viewportH),
        );
      }
      if (e.key === "0") {
        e.preventDefault();
        resetZoom();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    applyZoom,
    canNext,
    canPrev,
    closeWithMotion,
    exiting,
    index,
    onIndexChange,
    resetZoom,
    viewportH,
    viewportW,
  ]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (ignore.current) return;
      if (pinch.current || isPhotoZoomed(zoomRef.current.scale) || axis.current !== "undecided") {
        e.preventDefault();
      }
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (busy.current || exiting) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const focalX = e.clientX - rect.left - rect.width / 2;
      const focalY = e.clientY - rect.top - rect.height / 2;
      const delta = e.deltaY > 0 ? -0.18 : 0.18;
      applyZoom(
        photoZoomAtPoint(
          zoomRef.current,
          zoomRef.current.scale + delta,
          focalX,
          focalY,
          rect.width,
          rect.height,
        ),
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [applyZoom, exiting]);

  function focalFromClient(clientX: number, clientY: number) {
    const rect = rootRef.current?.getBoundingClientRect();
    const width = rect?.width ?? viewportW;
    const height = rect?.height ?? viewportH;
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;
    return {
      x: clientX - left - width / 2,
      y: clientY - top - height / 2,
      width,
      height,
    };
  }

  function beginPinch() {
    const pts = [...pointers.current.values()];
    if (pts.length < 2) return;
    const [a, b] = pts;
    pinch.current = {
      startDistance: pointerDistance(a, b),
      startZoom: { ...zoomRef.current },
      startMid: pointerMidpoint(a, b),
    };
    axis.current = "undecided";
    setDragging(false);
    setDx(0);
    setDy(0);
  }

  function updatePinch() {
    const state = pinch.current;
    const pts = [...pointers.current.values()];
    if (!state || pts.length < 2) return;
    const [a, b] = pts;
    const dist = pointerDistance(a, b);
    const mid = pointerMidpoint(a, b);
    const startFocal = focalFromClient(state.startMid.x, state.startMid.y);
    const currentFocal = focalFromClient(mid.x, mid.y);
    const scale = pinchScale(state.startZoom.scale, state.startDistance, dist);
    const zoomedAtStart = photoZoomAtPoint(
      state.startZoom,
      scale,
      startFocal.x,
      startFocal.y,
      startFocal.width,
      startFocal.height,
    );
    const pan = clampPhotoPan(
      zoomedAtStart.tx + (currentFocal.x - startFocal.x),
      zoomedAtStart.ty + (currentFocal.y - startFocal.y),
      zoomedAtStart.scale,
      startFocal.width,
      startFocal.height,
    );
    applyZoom({ scale: zoomedAtStart.scale, tx: pan.tx, ty: pan.ty });
  }

  function zoomToggleAtClient(clientX: number, clientY: number) {
    const focal = focalFromClient(clientX, clientY);
    applyZoom(
      photoZoomAtPoint(
        zoomRef.current,
        nextDoubleTapZoom(zoomRef.current.scale),
        focal.x,
        focal.y,
        focal.width,
        focal.height,
      ),
    );
  }

  function handlePossibleDoubleTap(clientX: number, clientY: number) {
    const now = Date.now();
    const prev = lastTap.current;
    lastTap.current = { at: now, x: clientX, y: clientY };
    if (!prev || now - prev.at > DOUBLE_TAP_MS || Math.hypot(clientX - prev.x, clientY - prev.y) > DOUBLE_TAP_PX) {
      return;
    }
    lastTap.current = null;
    zoomToggleAtClient(clientX, clientY);
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || exiting || busy.current) return;
    if ((e.target as HTMLElement).closest("[data-viewer-chrome]")) {
      ignore.current = true;
      return;
    }
    ignore.current = false;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;

    if (pointers.current.size >= 2) {
      beginPinch();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }

    activePointer.current = e.pointerId;
    axis.current = "undecided";
    start.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    last.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    panOrigin.current = { ...zoomRef.current };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (ignore.current || exiting || busy.current) return;
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch.current && pointers.current.size >= 2) {
      e.preventDefault();
      updatePinch();
      return;
    }

    if (activePointer.current !== e.pointerId) return;

    const nextDx = e.clientX - start.current.x;
    const nextDy = e.clientY - start.current.y;
    last.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    if (Math.abs(nextDx) > MOVE_EPS || Math.abs(nextDy) > MOVE_EPS) moved.current = true;

    if (isPhotoZoomed(zoomRef.current.scale)) {
      e.preventDefault();
      if (!dragging) {
        setDragging(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      const pan = clampPhotoPan(
        panOrigin.current.tx + nextDx,
        panOrigin.current.ty + nextDy,
        zoomRef.current.scale,
        viewportW,
        viewportH,
      );
      applyZoom({ scale: zoomRef.current.scale, ...pan });
      return;
    }

    const nextAxis = lockPhotoViewerAxis(nextDx, nextDy, axis.current);
    if (nextAxis === "undecided") return;
    if (axis.current === "undecided") {
      axis.current = nextAxis;
      setDragging(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    e.preventDefault();
    setDx(nextDx);
    setDy(nextDy);
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);

    if (ignore.current || exiting) {
      ignore.current = false;
      return;
    }

    if (pinch.current) {
      if (pointers.current.size < 2) {
        pinch.current = null;
        if (pointers.current.size === 1) {
          const [id, pt] = [...pointers.current.entries()][0]!;
          activePointer.current = id;
          start.current = { x: pt.x, y: pt.y, t: Date.now() };
          last.current = { x: pt.x, y: pt.y, t: Date.now() };
          panOrigin.current = { ...zoomRef.current };
          moved.current = true;
          setDragging(true);
        } else {
          activePointer.current = null;
          setDragging(false);
        }
      }
      return;
    }

    if (activePointer.current !== e.pointerId) return;
    activePointer.current = null;

    if (!moved.current) {
      if (e.pointerType === "touch" || e.pointerType === "pen") {
        handlePossibleDoubleTap(e.clientX, e.clientY);
      }
      setDragging(false);
      axis.current = "undecided";
      setDx(0);
      setDy(0);
      return;
    }

    if (isPhotoZoomed(zoomRef.current.scale)) {
      setDragging(false);
      axis.current = "undecided";
      setDx(0);
      setDy(0);
      return;
    }

    if (axis.current === "undecided") return;

    const endDx = last.current.x - start.current.x;
    const endDy = last.current.y - start.current.y;
    const totalDt = Math.max(1, Date.now() - start.current.t);
    const action = settlePhotoViewerGesture({
      axis: axis.current,
      dx: endDx,
      dy: endDy,
      vx: endDx / totalDt,
      vy: endDy / totalDt,
      canPrev,
      canNext,
    });
    setDragging(false);
    axis.current = "undecided";

    if (action === "close") {
      closeWithMotion();
      return;
    }
    if (action === "next" || action === "prev") {
      busy.current = true;
      const width = rootRef.current?.clientWidth || viewportW;
      setDx(action === "next" ? -width : width);
      setDy(0);
      window.setTimeout(() => {
        onIndexChange(index + (action === "next" ? 1 : -1));
        setDx(0);
        setDy(0);
        busy.current = false;
      }, SETTLE_MS);
      return;
    }
    setDx(0);
    setDy(0);
  }

  if (!photo || typeof document === "undefined") return null;

  const dim = zoomed ? 1 : photoViewerBackdropOpacity(offset.y);
  const caption = photo.caption || albumTitle || t("photos.noCaption");

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={caption}
      className="fixed inset-0 z-[80] overflow-hidden"
      style={{
        ...cover,
        backgroundColor: `rgba(0,0,0,${dim})`,
        touchAction: "none",
        overscrollBehavior: "none",
        transition: dragging ? "none" : "background-color 200ms ease",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(e) => {
        if (busy.current || exiting) return;
        if ((e.target as HTMLElement).closest("[data-viewer-chrome]")) return;
        e.preventDefault();
        lastTap.current = null;
        zoomToggleAtClient(e.clientX, e.clientY);
      }}
    >
      <div className="absolute inset-0 overflow-hidden">
        {photos.map((item, i) => {
          if (Math.abs(i - index) > 1) return null;
          const slotX = (i - index) * viewportW + (zoomed ? 0 : offset.x);
          const slotY = i === index ? (zoomed ? 0 : offset.y) : 0;
          const isCurrent = i === index;
          const zoomTransform =
            isCurrent && zoomed
              ? ` translate3d(${zoom.tx}px, ${zoom.ty}px, 0) scale(${zoom.scale})`
              : "";
          return (
            <img
              key={item.id}
              src={item.fullUrl}
              alt={item.caption ?? t("photos.noCaption")}
              referrerPolicy="no-referrer"
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full object-contain"
              style={{
                transform: `translate3d(${slotX}px, ${slotY}px, 0)${zoomTransform}`,
                transformOrigin: "center center",
                transition:
                  dragging || exiting || Boolean(pinch.current)
                    ? "none"
                    : "transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)",
              }}
            />
          );
        })}
      </div>

      <div
        className="absolute inset-x-0 top-0 z-20 flex items-start justify-between px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-8"
        style={{
          background: "linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)",
          opacity: dragging && axis.current === "vertical" && !zoomed ? 0.35 : 1,
        }}
      >
        <button
          type="button"
          data-viewer-chrome
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            closeWithMotion();
          }}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white"
          aria-label={t("photos.viewerClose")}
        >
          <X size={20} />
        </button>
        <p className="pointer-events-none pt-2.5 text-sm font-semibold text-white/90">
          {t("photos.viewerCounter", { current: index + 1, total: photos.length })}
          {zoomed ? ` · ${zoom.scale.toFixed(1)}×` : ""}
        </p>
        {onDownload ? (
          <button
            type="button"
            data-viewer-chrome
            disabled={downloading}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white disabled:opacity-50"
            aria-label={downloading ? t("photos.icloudDownloading") : t("photos.icloudDownload")}
          >
            <Download size={18} />
          </button>
        ) : (
          <span className="h-11 w-11" />
        )}
      </div>

      <div
        data-viewer-chrome
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-10"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)",
          opacity: dragging && axis.current === "vertical" && !zoomed ? 0.35 : 1,
        }}
      >
        <p className="text-center text-sm font-medium text-white">{caption}</p>
        <p className="mt-1 text-center text-[11px] text-white/70">{t("photos.viewerHint")}</p>
      </div>
    </div>,
    document.body,
  );
}
