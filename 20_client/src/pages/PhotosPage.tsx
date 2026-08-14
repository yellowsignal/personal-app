import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Cloud, Plus } from "lucide-react";
import TopBar from "../components/TopBar";
import OverlayScrim from "../components/OverlayScrim";
import PhotoLightbox from "../components/PhotoLightbox";
import { useLanguage } from "../i18n/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { photosApi, type LinkedIcloudAlbum } from "../api/photos";
import { ApiError } from "../api/http";
import { MAX_ICLOUD_ALBUMS, saveBlobLocally } from "../utils/photoUpload";

export default function PhotosPage() {
  const { t } = useLanguage();
  const { token, family } = useAuth();
  const [icloudAlbums, setIcloudAlbums] = useState<LinkedIcloudAlbum[]>([]);
  const [icloudLoading, setIcloudLoading] = useState(false);
  const [icloudDraft, setIcloudDraft] = useState("");
  const [icloudFormOpen, setIcloudFormOpen] = useState(false);
  const [icloudSaving, setIcloudSaving] = useState(false);
  const [icloudError, setIcloudError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ albumId: number; index: number } | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState<LinkedIcloudAlbum | null>(null);
  const [icloudDownloading, setIcloudDownloading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const loadIcloud = useCallback(async () => {
    if (!token || !family) {
      setIcloudAlbums([]);
      return;
    }
    setIcloudLoading(true);
    try {
      const data = await photosApi.icloudAlbums(token);
      setIcloudAlbums(data.albums);
    } catch {
      setIcloudAlbums([]);
    } finally {
      setIcloudLoading(false);
    }
  }, [token, family]);

  useEffect(() => {
    void loadIcloud();
  }, [loadIcloud]);

  const canAddAlbum = icloudAlbums.length < MAX_ICLOUD_ALBUMS;
  const viewerAlbum = viewer ? (icloudAlbums.find((a) => a.id === viewer.albumId) ?? null) : null;
  const viewerPhotos = viewerAlbum?.photos ?? [];
  const viewerIndex = viewer ? Math.min(viewer.index, Math.max(0, viewerPhotos.length - 1)) : 0;

  function openAlbumForm() {
    if (!family || !canAddAlbum) return;
    setIcloudDraft("");
    setIcloudError(null);
    setIcloudFormOpen(true);
  }

  async function handleSaveIcloud(e: FormEvent) {
    e.preventDefault();
    if (!token || icloudSaving) return;
    const url = icloudDraft.trim();
    if (!url) {
      setIcloudError(t("photos.icloudNeedUrl"));
      return;
    }
    setIcloudSaving(true);
    setIcloudError(null);
    try {
      const created = await photosApi.addIcloudAlbum(token, url);
      setIcloudAlbums((prev) => [...prev.filter((a) => a.id !== created.id), created]);
      setIcloudDraft("");
      setIcloudFormOpen(false);
    } catch (err) {
      setIcloudError(err instanceof ApiError ? err.message : t("photos.icloudError"));
    } finally {
      setIcloudSaving(false);
    }
  }

  async function handleUnlinkIcloud() {
    if (!token || icloudSaving || !confirmUnlink) return;
    setIcloudSaving(true);
    try {
      const data = await photosApi.removeIcloudAlbum(token, confirmUnlink.id);
      setIcloudAlbums(data.albums);
      if (viewer?.albumId === confirmUnlink.id) setViewer(null);
      setConfirmUnlink(null);
    } catch (err) {
      setIcloudError(err instanceof ApiError ? err.message : t("photos.icloudError"));
      setConfirmUnlink(null);
    } finally {
      setIcloudSaving(false);
    }
  }

  async function handleDownloadIcloud() {
    if (!token || !viewerAlbum || icloudDownloading) return;
    const photo = viewerPhotos[viewerIndex];
    if (!photo) return;
    setIcloudDownloading(true);
    try {
      const blob = await photosApi.downloadIcloudPhoto(token, viewerAlbum.id, photo.id);
      const name = `${photo.caption || viewerAlbum.name || "icloud"}.jpg`;
      await saveBlobLocally(blob, name);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : t("photos.icloudDownloadError"));
    } finally {
      setIcloudDownloading(false);
    }
  }

  return (
    <div>
      <TopBar
        title={t("photos.title")}
        subtitle={t("photos.subtitle")}
        right={
          family && canAddAlbum ? (
            <button
              type="button"
              onClick={openAlbumForm}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white"
              aria-label={t("photos.icloudAdd")}
            >
              <Plus size={18} />
            </button>
          ) : undefined
        }
      />

      <div className="mx-auto max-w-md px-4 pt-4 pb-8">
        {family ? (
          <section className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-bold text-sky-900">
                <Cloud size={16} />
                {t("photos.icloudTitle")}
              </p>
              {canAddAlbum && icloudAlbums.length > 0 && !icloudFormOpen && (
                <button
                  type="button"
                  onClick={openAlbumForm}
                  className="text-xs font-semibold text-sky-700"
                >
                  {t("photos.icloudAdd")}
                </button>
              )}
            </div>
            <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-sky-800">
              {icloudAlbums.length === 0 ? t("photos.icloudHowTo") : t("photos.hint")}
            </p>
            {icloudAlbums.length === 0 && !icloudFormOpen && (
              <button
                type="button"
                onClick={openAlbumForm}
                className="mt-3 w-full rounded-xl bg-sky-700 py-2.5 text-sm font-semibold text-white"
              >
                {t("photos.icloudSave")}
              </button>
            )}
            {icloudFormOpen && (
              <form onSubmit={(e) => void handleSaveIcloud(e)} className="mt-3">
                <input
                  value={icloudDraft}
                  onChange={(e) => setIcloudDraft(e.target.value)}
                  placeholder={t("photos.icloudPlaceholder")}
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-400"
                />
                {icloudError && <p className="mt-2 text-xs text-rose-600">{icloudError}</p>}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIcloudFormOpen(false)}
                    className="flex-1 rounded-xl border border-sky-200 py-2 text-sm font-semibold text-sky-800"
                  >
                    {t("photos.cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={icloudSaving}
                    className="flex-1 rounded-xl bg-sky-700 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {icloudSaving ? t("photos.icloudSaving") : t("photos.icloudSave")}
                  </button>
                </div>
              </form>
            )}
            {icloudLoading && <p className="mt-3 text-xs text-sky-700">{t("photos.loading")}</p>}
            {icloudError && !icloudFormOpen && <p className="mt-2 text-xs text-rose-600">{icloudError}</p>}
            {pageError && <p className="mt-2 text-xs text-rose-600">{pageError}</p>}
            {icloudAlbums.map((album) => (
              <div key={album.id} className="mt-4 border-t border-sky-100 pt-3 first:mt-3 first:border-0 first:pt-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-sky-900">{album.name || t("photos.icloudTitle")}</p>
                    <a
                      href={album.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-block text-[11px] font-semibold text-sky-700 underline"
                    >
                      {t("photos.icloudOpen")}
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmUnlink(album)}
                    className="text-xs font-semibold text-sky-600"
                  >
                    {t("photos.icloudUnlink")}
                  </button>
                </div>
                {album.error && <p className="mt-2 text-xs text-rose-600">{t("photos.icloudError")}</p>}
                {!album.error && album.photos.length === 0 && (
                  <p className="mt-2 text-xs text-sky-800">{t("photos.icloudEmpty")}</p>
                )}
                {album.photos.length > 0 && (
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {album.photos.map((p, photoIndex) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setViewer({ albumId: album.id, index: photoIndex })}
                        className="relative aspect-square overflow-hidden rounded-lg bg-white"
                      >
                        <img
                          src={p.thumbUrl}
                          alt={p.caption ?? t("photos.noCaption")}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>
        ) : (
          <p className="rounded-2xl bg-neutral-50 px-4 py-3 text-xs text-neutral-500">
            {t("photos.needFamily")}
          </p>
        )}
      </div>

      {viewer && viewerPhotos.length > 0 && (
        <PhotoLightbox
          photos={viewerPhotos}
          index={viewerIndex}
          albumTitle={viewerAlbum?.name ?? undefined}
          onIndexChange={(next) => setViewer({ albumId: viewer.albumId, index: next })}
          onClose={() => setViewer(null)}
          onDownload={() => void handleDownloadIcloud()}
          downloading={icloudDownloading}
        />
      )}

      {confirmUnlink && (
        <OverlayScrim
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onDismiss={() => setConfirmUnlink(null)}
          label={t("photos.cancel")}
          swipeToDismiss={false}
        >
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-bold text-neutral-900">{t("photos.icloudUnlink")}</h2>
            <p className="mt-2 text-sm text-neutral-500">{t("photos.icloudUnlinkConfirm")}</p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmUnlink(null)}
                className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-600"
              >
                {t("photos.cancel")}
              </button>
              <button
                type="button"
                disabled={icloudSaving}
                onClick={() => void handleUnlinkIcloud()}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {t("photos.icloudUnlink")}
              </button>
            </div>
          </div>
        </OverlayScrim>
      )}
    </div>
  );
}
