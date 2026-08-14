import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { useLanguage } from "../i18n/LanguageContext";
import type { IcloudAlbumPhoto } from "../api/photos";
import {
  lockPhotoViewerAxis,
  photoViewerBackdropOpacity,
  photoViewerDragOffset,
  settlePhotoViewerGesture,
  type PhotoViewerAxis,
} from "../utils/photoViewer";

const SETTLE_MS = 200;

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
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [viewportW, setViewportW] = useState(() =>
    typeof window === "undefined" ? 390 : window.innerWidth,
  );

  const photo = photos[index];
  const canPrev = index > 0;
  const canNext = index < photos.length - 1;
  const offset = dragging
    ? photoViewerDragOffset({
        axis: axis.current,
        dx,
        dy,
        canPrev,
        canNext,
      })
    : { x: dx, y: Math.max(0, dy) };

  useBodyScrollLock(true);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const sync = () => setViewportW(el.clientWidth || window.innerWidth);
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
      if (e.key === "ArrowRight" && canNext) {
        e.preventDefault();
        onIndexChange(index + 1);
      }
      if (e.key === "ArrowLeft" && canPrev) {
        e.preventDefault();
        onIndexChange(index - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canNext, canPrev, closeWithMotion, exiting, index, onIndexChange]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (ignore.current) return;
      if (axis.current !== "undecided") e.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || exiting || busy.current) return;
    if ((e.target as HTMLElement).closest("[data-viewer-chrome]")) {
      ignore.current = true;
      return;
    }
    ignore.current = false;
    axis.current = "undecided";
    start.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    last.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (ignore.current || exiting || busy.current) return;
    const nextDx = e.clientX - start.current.x;
    const nextDy = e.clientY - start.current.y;
    last.current = { x: e.clientX, y: e.clientY, t: Date.now() };
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

  function onPointerUp() {
    if (ignore.current || exiting) {
      ignore.current = false;
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

  const dim = photoViewerBackdropOpacity(offset.y);
  const caption = photo.caption || albumTitle || t("photos.noCaption");

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={caption}
      className="fixed inset-0 z-[80] overflow-hidden"
      style={{
        backgroundColor: `rgba(0,0,0,${dim})`,
        touchAction: "none",
        overscrollBehavior: "none",
        transition: dragging ? "none" : "background-color 200ms ease",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="absolute inset-0 overflow-hidden">
        {photos.map((item, i) => {
          if (Math.abs(i - index) > 1) return null;
          const slotX = (i - index) * viewportW + offset.x;
          const slotY = i === index ? offset.y : 0;
          return (
            <img
              key={item.id}
              src={item.fullUrl}
              alt={item.caption ?? t("photos.noCaption")}
              referrerPolicy="no-referrer"
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full object-contain"
              style={{
                transform: `translate3d(${slotX}px, ${slotY}px, 0)`,
                transition: dragging || exiting ? "none" : "transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)",
              }}
            />
          );
        })}
      </div>

      <div
        data-viewer-chrome
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-8"
        style={{
          background: "linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)",
          opacity: dragging && axis.current === "vertical" ? 0.35 : 1,
        }}
      >
        <button
          type="button"
          onClick={closeWithMotion}
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white"
          aria-label={t("photos.viewerClose")}
        >
          <X size={20} />
        </button>
        <p className="pointer-events-none pt-2 text-sm font-semibold text-white/90">
          {t("photos.viewerCounter", { current: index + 1, total: photos.length })}
        </p>
        {onDownload ? (
          <button
            type="button"
            disabled={downloading}
            onClick={onDownload}
            className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white disabled:opacity-50"
            aria-label={downloading ? t("photos.icloudDownloading") : t("photos.icloudDownload")}
          >
            <Download size={18} />
          </button>
        ) : (
          <span className="h-10 w-10" />
        )}
      </div>

      <div
        data-viewer-chrome
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-10"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)",
          opacity: dragging && axis.current === "vertical" ? 0.35 : 1,
        }}
      >
        <p className="text-center text-sm font-medium text-white">{caption}</p>
        <p className="mt-1 text-center text-[11px] text-white/70">{t("photos.viewerHint")}</p>
      </div>
    </div>,
    document.body,
  );
}
