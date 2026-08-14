import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, Cloud, MoreHorizontal, Plus } from "lucide-react";
import TopBar from "../components/TopBar";
import OverlayScrim from "../components/OverlayScrim";
import ItemDetailSheet, { DetailRow } from "../components/ItemDetailSheet";
import PhotoLightbox from "../components/PhotoLightbox";
import { useLanguage } from "../i18n/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { photosApi, type LinkedIcloudAlbum } from "../api/photos";
import { ApiError } from "../api/http";
import { MAX_ICLOUD_ALBUMS, saveBlobLocally } from "../utils/photoUpload";
import { albumCoverPhoto, sortAlbumPhotosOldestFirst } from "../utils/albumCover";

export default function PhotosPage() {
  const { t } = useLanguage();
  const { token, family } = useAuth();
  const [icloudAlbums, setIcloudAlbums] = useState<LinkedIcloudAlbum[]>([]);
  const [icloudLoading, setIcloudLoading] = useState(false);
  const [icloudDraft, setIcloudDraft] = useState("");
  const [icloudFormOpen, setIcloudFormOpen] = useState(false);
  const [editingAlbum, setEditingAlbum] = useState<LinkedIcloudAlbum | null>(null);
  const [icloudSaving, setIcloudSaving] = useState(false);
  const [icloudError, setIcloudError] = useState<string | null>(null);
  const [openAlbumId, setOpenAlbumId] = useState<number | null>(null);
  const [albumMenu, setAlbumMenu] = useState<LinkedIcloudAlbum | null>(null);
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
  const openAlbum = openAlbumId != null ? (icloudAlbums.find((a) => a.id === openAlbumId) ?? null) : null;
  const openPhotos = useMemo(
    () => (openAlbum ? sortAlbumPhotosOldestFirst(openAlbum.photos) : []),
    [openAlbum],
  );
  const viewerAlbum = viewer ? (icloudAlbums.find((a) => a.id === viewer.albumId) ?? null) : null;
  const viewerPhotos = useMemo(
    () => (viewerAlbum ? sortAlbumPhotosOldestFirst(viewerAlbum.photos) : []),
    [viewerAlbum],
  );
  const viewerIndex = viewer ? Math.min(viewer.index, Math.max(0, viewerPhotos.length - 1)) : 0;

  function closeForm() {
    setIcloudFormOpen(false);
    setEditingAlbum(null);
    setIcloudError(null);
  }

  function openAddForm() {
    if (!family || !canAddAlbum) return;
    setEditingAlbum(null);
    setIcloudDraft("");
    setIcloudError(null);
    setIcloudFormOpen(true);
  }

  function openEditForm(album: LinkedIcloudAlbum) {
    setAlbumMenu(null);
    setEditingAlbum(album);
    setIcloudDraft(album.url);
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
      if (editingAlbum) {
        const updated = await photosApi.updateIcloudAlbum(token, editingAlbum.id, url);
        setIcloudAlbums((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      } else {
        const created = await photosApi.addIcloudAlbum(token, url);
        setIcloudAlbums((prev) => [...prev.filter((a) => a.id !== created.id), created]);
      }
      closeForm();
    } catch (err) {
      if (err instanceof ApiError && err.code === "ICLOUD_NOT_FOUND") {
        setIcloudError(t("photos.icloudNotPublic"));
      } else {
        setIcloudError(err instanceof ApiError ? err.message : t("photos.icloudError"));
      }
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
      if (openAlbumId === confirmUnlink.id) setOpenAlbumId(null);
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
        title={openAlbum ? openAlbum.name || t("photos.icloudTitle") : t("photos.title")}
        subtitle={
          openAlbum ? t("photos.photoCount", { n: openPhotos.length }) : t("photos.subtitle")
        }
        left={
          openAlbum ? (
            <button
              type="button"
              onClick={() => {
                setOpenAlbumId(null);
                setViewer(null);
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600"
              aria-label={t("photos.back")}
            >
              <ArrowLeft size={18} />
            </button>
          ) : undefined
        }
        right={
          openAlbum ? (
            <button
              type="button"
              onClick={() => setAlbumMenu(openAlbum)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600"
              aria-label={t("photos.edit")}
            >
              <MoreHorizontal size={18} />
            </button>
          ) : family && canAddAlbum ? (
            <button
              type="button"
              onClick={openAddForm}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white"
              aria-label={t("photos.icloudAdd")}
            >
              <Plus size={18} />
            </button>
          ) : undefined
        }
      />

      <div className="mx-auto max-w-md px-4 pt-4 pb-8">
        {!family ? (
          <p className="rounded-2xl bg-neutral-50 px-4 py-3 text-xs text-neutral-500">
            {t("photos.needFamily")}
          </p>
        ) : openAlbum ? (
          <>
            <div className="mb-3">
              <a
                href={openAlbum.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-sky-700 underline"
              >
                {t("photos.icloudOpen")}
              </a>
            </div>
            {openAlbum.error && <p className="mb-3 text-xs text-rose-600">{t("photos.icloudError")}</p>}
            {pageError && <p className="mb-3 text-xs text-rose-600">{pageError}</p>}
            {!openAlbum.error && openPhotos.length === 0 && (
              <p className="rounded-2xl bg-white px-4 py-10 text-center text-sm text-neutral-500 shadow-sm ring-1 ring-black/5">
                {t("photos.icloudEmpty")}
              </p>
            )}
            {openPhotos.length > 0 && (
              <div className="grid grid-cols-3 gap-1.5">
                {openPhotos.map((p, photoIndex) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setViewer({ albumId: openAlbum.id, index: photoIndex })}
                    className="relative aspect-square overflow-hidden rounded-lg bg-neutral-100"
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
          </>
        ) : (
          <>
            <p className="whitespace-pre-line text-xs leading-relaxed text-neutral-500">
              {icloudAlbums.length === 0 ? t("photos.icloudHowTo") : t("photos.hint")}
            </p>
            {icloudAlbums.length === 0 && (
              <button
                type="button"
                onClick={openAddForm}
                className="mt-4 w-full rounded-xl bg-sky-700 py-2.5 text-sm font-semibold text-white"
              >
                {t("photos.icloudSave")}
              </button>
            )}
            {icloudLoading && <p className="mt-3 text-xs text-sky-700">{t("photos.loading")}</p>}
            {icloudError && !icloudFormOpen && <p className="mt-2 text-xs text-rose-600">{icloudError}</p>}
            {pageError && <p className="mt-2 text-xs text-rose-600">{pageError}</p>}
            {icloudAlbums.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {icloudAlbums.map((album) => {
                  const cover = albumCoverPhoto(album.photos);
                  return (
                    <div
                      key={album.id}
                      className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5"
                    >
                      <button
                        type="button"
                        onClick={() => setOpenAlbumId(album.id)}
                        className="block w-full text-left"
                      >
                        <div className="aspect-[4/3] bg-neutral-100">
                          {cover ? (
                            <img
                              src={cover.thumbUrl}
                              alt={album.name || t("photos.icloudTitle")}
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-neutral-300">
                              <Cloud size={28} />
                            </div>
                          )}
                        </div>
                        <div className="px-2.5 py-2">
                          <p className="truncate text-sm font-semibold text-neutral-900">
                            {album.name || t("photos.icloudTitle")}
                          </p>
                          <p className="mt-0.5 text-[11px] text-neutral-400">
                            {album.error
                              ? t("photos.icloudError")
                              : t("photos.photoCount", { n: album.photos.length })}
                          </p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAlbumMenu(album)}
                        className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white"
                        aria-label={t("photos.edit")}
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
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

      {albumMenu && (
        <ItemDetailSheet
          title={albumMenu.name || t("photos.icloudTitle")}
          onClose={() => setAlbumMenu(null)}
          closeLabel={t("photos.cancel")}
          editLabel={t("photos.icloudChange")}
          deleteLabel={t("photos.icloudUnlink")}
          canManage
          onEdit={() => openEditForm(albumMenu)}
          onDelete={() => {
            setConfirmUnlink(albumMenu);
            setAlbumMenu(null);
          }}
        >
          <DetailRow label={t("photos.icloudTitle")}>
            {albumMenu.error
              ? t("photos.icloudError")
              : t("photos.photoCount", { n: albumMenu.photos.length })}
          </DetailRow>
          <a
            href={albumMenu.url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-sm font-semibold text-sky-700 underline"
          >
            {t("photos.icloudOpen")}
          </a>
        </ItemDetailSheet>
      )}

      {icloudFormOpen && (
        <OverlayScrim
          className="fixed inset-0 z-[55] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onDismiss={closeForm}
          label={t("photos.cancel")}
        >
          <form
            onSubmit={(e) => void handleSaveIcloud(e)}
            className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
          >
            <h2 className="text-base font-bold text-neutral-900">
              {editingAlbum ? t("photos.icloudChange") : t("photos.icloudAdd")}
            </h2>
            <input
              value={icloudDraft}
              onChange={(e) => setIcloudDraft(e.target.value)}
              placeholder={t("photos.icloudPlaceholder")}
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              className="mt-3 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-sky-400"
            />
            {icloudError && <p className="mt-2 text-xs text-rose-600">{icloudError}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={closeForm}
                className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-600"
              >
                {t("photos.cancel")}
              </button>
              <button
                type="submit"
                disabled={icloudSaving}
                className="flex-1 rounded-xl bg-sky-700 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {icloudSaving
                  ? t("photos.icloudSaving")
                  : editingAlbum
                    ? t("photos.save")
                    : t("photos.icloudSave")}
              </button>
            </div>
          </form>
        </OverlayScrim>
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
