import { useCallback, useEffect, useState } from "react";
import { Maximize2, Minimize2, Sun, X } from "lucide-react";
import type { PublicDocument } from "../api/documents";
import { documentsApi, type ScanSide } from "../api/documents";
import { pdfBlobToImageUrl } from "../utils/pdfToImage";

interface DocumentShowModeProps {
  doc: PublicDocument;
  token: string;
  revealedFields: Record<string, string> | null;
  t: (key: string) => string;
  onClose: () => void;
}

function fieldDisplay(
  field: PublicDocument["fields"][number],
  revealedFields: Record<string, string> | null,
): string | null {
  if (!field.isSecret) return field.value?.trim() || null;
  const revealed = revealedFields?.[field.id];
  if (revealed?.trim()) return revealed.trim();
  if (field.hasValue) return null;
  return null;
}

export default function DocumentShowMode({
  doc,
  token,
  revealedFields,
  t,
  onClose,
}: DocumentShowModeProps) {
  const sides: ScanSide[] = doc.hasScanBack ? ["front", "back"] : ["front"];
  const [side, setSide] = useState<ScanSide>("front");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brightnessBoost, setBrightnessBoost] = useState(true);
  const [uiHidden, setUiHidden] = useState(false);

  const visibleFields = doc.fields
    .map((field) => ({ field, value: fieldDisplay(field, revealedFields) }))
    .filter((item): item is { field: PublicDocument["fields"][number]; value: string } => Boolean(item.value));

  const loadSide = useCallback(
    async (nextSide: ScanSide) => {
      setLoading(true);
      setError(null);
      setImageUrl(null);
      try {
        const pdf = await documentsApi.downloadScanSide(token, doc.id, nextSide);
        const url = await pdfBlobToImageUrl(pdf, 2.5);
        setImageUrl(url);
        setSide(nextSide);
      } catch {
        setError(t("documents.showModeLoadError"));
      } finally {
        setLoading(false);
      }
    },
    [doc.id, token, t],
  );

  useEffect(() => {
    void loadSide("front");
  }, [loadSide]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    void (async () => {
      if (!("wakeLock" in navigator)) return;
      try {
        wakeLock = await navigator.wakeLock.request("screen");
      } catch {
        /* ignore — not supported or denied */
      }
    })();
    return () => {
      void wakeLock?.release();
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col ${brightnessBoost ? "bg-white" : "bg-neutral-950"}`}
      role="dialog"
      aria-modal="true"
      aria-label={t("documents.showModeTitle")}
    >
      {!uiHidden && (
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-neutral-900">{doc.typeLabel}</p>
            <p className="text-[11px] text-neutral-500">{t("documents.showModeHint")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setBrightnessBoost((v) => !v)}
              className="rounded-full p-2.5 text-neutral-600 hover:bg-neutral-100"
              aria-label={t("documents.showModeBrightness")}
            >
              <Sun size={18} />
            </button>
            <button
              type="button"
              onClick={() => setUiHidden(true)}
              className="rounded-full p-2.5 text-neutral-600 hover:bg-neutral-100"
              aria-label={t("documents.showModeFullscreen")}
            >
              <Maximize2 size={18} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2.5 text-neutral-600 hover:bg-neutral-100"
              aria-label={t("documents.cancel")}
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-3"
        onClick={() => setUiHidden((v) => !v)}
        aria-label={uiHidden ? t("documents.showModeShowUi") : t("documents.showModeHideUi")}
      >
        {loading && (
          <p className="text-sm text-neutral-400">{t("documents.showModeLoading")}</p>
        )}
        {error && <p className="px-4 text-center text-sm text-rose-600">{error}</p>}
        {imageUrl && !loading && (
          <img
            src={imageUrl}
            alt={doc.typeLabel}
            className="max-h-full max-w-full object-contain"
            style={
              brightnessBoost
                ? { filter: "brightness(1.12) contrast(1.08)", imageRendering: "auto" }
                : undefined
            }
            draggable={false}
          />
        )}
        {uiHidden && (
          <span className="pointer-events-none absolute bottom-4 rounded-full bg-black/50 px-3 py-1.5 text-[11px] text-white">
            {t("documents.showModeTapHint")}
          </span>
        )}
      </button>

      {!uiHidden && sides.length > 1 && (
        <div className="flex justify-center gap-2 px-4 pb-2">
          {sides.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void loadSide(s)}
              disabled={loading && side !== s}
              className={`rounded-full px-4 py-2 text-xs font-semibold ${
                side === s ? "bg-indigo-600 text-white" : "bg-neutral-100 text-neutral-600"
              }`}
            >
              {s === "front" ? t("documents.scanFrontLabel") : t("documents.scanBackLabel")}
            </button>
          ))}
        </div>
      )}

      {!uiHidden && visibleFields.length > 0 && (
        <div className="border-t border-neutral-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-wrap gap-2">
            {visibleFields.map(({ field, value }) => (
              <div
                key={field.id}
                className="rounded-xl bg-neutral-50 px-3 py-2 ring-1 ring-neutral-100"
              >
                <p className="text-[10px] font-medium text-neutral-400">{field.label}</p>
                <p className="font-mono text-sm font-semibold text-neutral-900">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {uiHidden && (
        <button
          type="button"
          onClick={() => setUiHidden(false)}
          className="absolute right-4 top-[max(0.75rem,env(safe-area-inset-top))] rounded-full bg-black/40 p-2.5 text-white"
          aria-label={t("documents.showModeShowUi")}
        >
          <Minimize2 size={18} />
        </button>
      )}
    </div>
  );
}
