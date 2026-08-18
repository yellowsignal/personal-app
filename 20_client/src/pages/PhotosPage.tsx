import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Cloud, MoreHorizontal, Plus } from "lucide-react";
import TopBar from "../components/TopBar";
import OverlayScrim from "../components/OverlayScrim";
import ItemDetailSheet, { DetailRow } from "../components/ItemDetailSheet";
import PhotoLightbox from "../components/PhotoLightbox";
import { useLanguage } from "../i18n/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { useAuthedImage } from "../hooks/useAuthedImage";
import { useKeepFocusedInScrollParent } from "../hooks/useKeepFocusedInScrollParent";
import { useResetWindowScroll } from "../hooks/useBodyScrollLock";
import {
  photosApi,
  type IcloudAlbumSummary,
  type LinkedIcloudAlbum,
} from "../api/photos";
import { ApiError } from "../api/http";
import { MAX_ICLOUD_ALBUMS, saveBlobLocally } from "../utils/photoUpload";
import { sortAlbumPhotosOldestFirst, withAlbumCoverCacheKey } from "../utils/albumCover";
import { isDrillInGhostClick } from "../utils/drillInClick";
import { removeLegacyBodyOverlays } from "../utils/overlayRoot";

function AlbumCardCover({
  token,
  coverUrl,
  coverPhotoId,
  alt,
}: {
  token: string;
  coverUrl: string | null;
  coverPhotoId: string | null;
  alt: string;
}) {
  const src = useAuthedImage(token, withAlbumCoverCacheKey(coverUrl, coverPhotoId));
  if (!src) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-300">
        <Cloud size={28} />
      </div>
    );
  }
  return <img src={src} alt={alt} className="h-full w-full object-cover" />;
}

function toSummary(album: LinkedIcloudAlbum | IcloudAlbumSummary): IcloudAlbumSummary {
  return {
    id: album.id,
    url: album.url,
    name: album.name,
    nameLocked: album.nameLocked,
    photoCount: album.photoCount,
    coverPhotoId: album.coverPhotoId,
    coverUrl: album.coverUrl,
    syncedAt: album.syncedAt,
  };
}

export default function PhotosPage() {
  const { t } = useLanguage();
  const { token, family } = useAuth();
  const [albumSummaries, setAlbumSummaries] = useState<IcloudAlbumSummary[]>([]);
  const [openDetail, setOpenDetail] = useState<LinkedIcloudAlbum | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [icloudLoading, setIcloudLoading] = useState(false);
  const [icloudDraft, setIcloudDraft] = useState("");
  const [icloudFormOpen, setIcloudFormOpen] = useState(false);
  const [editingUrlAlbum, setEditingUrlAlbum] = useState<IcloudAlbumSummary | null>(null);
  const [renameAlbum, setRenameAlbum] = useState<IcloudAlbumSummary | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [icloudSaving, setIcloudSaving] = useState(false);
  const [icloudError, setIcloudError] = useState<string | null>(null);
  const [albumMenu, setAlbumMenu] = useState<IcloudAlbumSummary | null>(null);
  const [viewer, setViewer] = useState<{ index: number } | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState<IcloudAlbumSummary | null>(null);
  const [icloudDownloading, setIcloudDownloading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pickingCover, setPickingCover] = useState(false);
  const [pickingCoverId, setPickingCoverId] = useState<string | null>(null);
  const [coverFlash, setCoverFlash] = useState<string | null>(null);
  const [showHowTo, setShowHowTo] = useState(false);
  const icloudFormRef = useRef<HTMLFormElement>(null);
  const renameFormRef = useRef<HTMLFormElement>(null);
  useKeepFocusedInScrollParent(icloudFormOpen, icloudFormRef);
  useKeepFocusedInScrollParent(Boolean(renameAlbum), renameFormRef);

  const loadIcloud = useCallback(async () => {
    if (!token || !family) {
      setAlbumSummaries([]);
      return;
    }
    setIcloudLoading(true);
    try {
      const data = await photosApi.icloudAlbums(token);
      setAlbumSummaries(data.albums);
    } catch {
      setAlbumSummaries([]);
    } finally {
      setIcloudLoading(false);
    }
  }, [token, family]);

  useEffect(() => {
    void loadIcloud();
  }, [loadIcloud]);

  const openAlbumId = openDetail?.id ?? null;
  // Album open/close is in-page (no route change) — still start at the top.
  useResetWindowScroll(openAlbumId);
  const albumOpenedAt = useRef(0);

  useEffect(() => {
    setViewer(null);
    albumOpenedAt.current = Date.now();
    removeLegacyBodyOverlays();
  }, [openAlbumId]);

  useEffect(() => {
    if (!token || openAlbumId == null) return;
    let cancelled = false;
    setDetailLoading(true);
    setPageError(null);
    setPickingCover(false);
    void (async () => {
      try {
        const detail = await photosApi.getIcloudAlbum(token, openAlbumId);
        if (cancelled) return;
        setOpenDetail(detail);
        setAlbumSummaries((prev) =>
          prev.map((a) => (a.id === detail.id ? toSummary(detail) : a)),
        );
      } catch (err) {
        if (!cancelled) {
          setPageError(err instanceof ApiError ? err.message : t("photos.icloudError"));
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, openAlbumId, t]);

  const canAddAlbum = albumSummaries.length < MAX_ICLOUD_ALBUMS;
  const openPhotos = useMemo(
    () => (openDetail ? sortAlbumPhotosOldestFirst(openDetail.photos) : []),
    [openDetail],
  );
  const viewerPhotos = openPhotos;
  const viewerIndex = viewer ? Math.min(viewer.index, Math.max(0, viewerPhotos.length - 1)) : 0;

  function closeForm() {
    setIcloudFormOpen(false);
    setEditingUrlAlbum(null);
    setIcloudError(null);
  }

  function openAddForm() {
    if (!family || !canAddAlbum) return;
    setEditingUrlAlbum(null);
    setIcloudDraft("");
    setIcloudError(null);
    setIcloudFormOpen(true);
  }

  function openEditUrlForm(album: IcloudAlbumSummary) {
    setAlbumMenu(null);
    setEditingUrlAlbum(album);
    setIcloudDraft(album.url);
    setIcloudError(null);
    setIcloudFormOpen(true);
  }

  function openRenameForm(album: IcloudAlbumSummary) {
    setAlbumMenu(null);
    setRenameAlbum(album);
    setRenameDraft(album.name || "");
    setIcloudError(null);
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
      if (editingUrlAlbum) {
        const updated = await photosApi.updateIcloudAlbum(token, editingUrlAlbum.id, { url });
        setAlbumSummaries((prev) => prev.map((a) => (a.id === updated.id ? toSummary(updated) : a)));
        if (openDetail?.id === updated.id) setOpenDetail(updated);
      } else {
        const created = await photosApi.addIcloudAlbum(token, url);
        setAlbumSummaries((prev) => [...prev.filter((a) => a.id !== created.id), toSummary(created)]);
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

  async function handleRename(e: FormEvent) {
    e.preventDefault();
    if (!token || !renameAlbum || icloudSaving) return;
    const name = renameDraft.trim();
    if (!name) {
      setIcloudError(t("photos.icloudNeedName"));
      return;
    }
    setIcloudSaving(true);
    setIcloudError(null);
    try {
      const updated = await photosApi.updateIcloudAlbum(token, renameAlbum.id, { name });
      setAlbumSummaries((prev) => prev.map((a) => (a.id === updated.id ? toSummary(updated) : a)));
      if (openDetail?.id === updated.id) setOpenDetail(updated);
      setRenameAlbum(null);
    } catch (err) {
      setIcloudError(err instanceof ApiError ? err.message : t("photos.icloudError"));
    } finally {
      setIcloudSaving(false);
    }
  }

  async function handleSetCover(photoId: string) {
    if (!token || !openDetail || icloudSaving) return;
    setIcloudSaving(true);
    setPickingCoverId(photoId);
    setPageError(null);
    try {
      const updated = await photosApi.updateIcloudAlbum(token, openDetail.id, { coverPhotoId: photoId });
      setOpenDetail(updated);
      setAlbumSummaries((prev) => prev.map((a) => (a.id === updated.id ? toSummary(updated) : a)));
      setCoverFlash(t("photos.icloudCoverSet"));
      setPickingCover(false);
      window.setTimeout(() => setCoverFlash(null), 2200);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : t("photos.icloudError"));
    } finally {
      setIcloudSaving(false);
      setPickingCoverId(null);
    }
  }

  async function handleUnlinkIcloud() {
    if (!token || icloudSaving || !confirmUnlink) return;
    setIcloudSaving(true);
    try {
      const data = await photosApi.removeIcloudAlbum(token, confirmUnlink.id);
      setAlbumSummaries(data.albums);
      if (openDetail?.id === confirmUnlink.id) {
        setOpenDetail(null);
        setViewer(null);
      }
      setConfirmUnlink(null);
    } catch (err) {
      setIcloudError(err instanceof ApiError ? err.message : t("photos.icloudError"));
      setConfirmUnlink(null);
    } finally {
      setIcloudSaving(false);
    }
  }

  async function handleDownloadIcloud() {
    if (!token || !openDetail || icloudDownloading) return;
    const photo = viewerPhotos[viewerIndex];
    if (!photo) return;
    setIcloudDownloading(true);
    try {
      const blob = await photosApi.downloadIcloudPhoto(token, openDetail.id, photo.id);
      const name = `${photo.caption || openDetail.name || "icloud"}.jpg`;
      await saveBlobLocally(blob, name);
    } catch (err) {
      setPageError(err instanceof ApiError ? err.message : t("photos.icloudDownloadError"));
    } finally {
      setIcloudDownloading(false);
    }
  }

  function photoCountLabel(count: number | null | undefined) {
    if (count == null) return t("photos.photoCountPending");
    return t("photos.photoCount", { n: count });
  }

  return (
    <div>
      <TopBar
        title={openDetail ? openDetail.name || t("photos.icloudTitle") : t("photos.title")}
        subtitle={
          openDetail
            ? detailLoading
              ? t("photos.loading")
              : t("photos.photoCount", { n: openPhotos.length })
            : t("photos.subtitle")
        }
        left={
          openDetail ? (
            <button
              type="button"
              onClick={() => {
                setOpenDetail(null);
                setViewer(null);
                setPickingCover(false);
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600"
              aria-label={t("photos.back")}
            >
              <ArrowLeft size={18} />
            </button>
          ) : undefined
        }
        right={
          openDetail ? (
            <button
              type="button"
              onClick={() => setAlbumMenu(toSummary(openDetail))}
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
        ) : openDetail ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              {pickingCover ? (
                <button
                  type="button"
                  onClick={() => {
                    setPickingCover(false);
                    setPickingCoverId(null);
                  }}
                  className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-600"
                >
                  {t("photos.cancel")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setPickingCover(true)}
                  className="rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  {t("photos.icloudPickCover")}
                </button>
              )}
            </div>
            {pickingCover && (
              <p className="mb-3 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-800">
                {t("photos.icloudPickCoverHint")}
              </p>
            )}
            {coverFlash && (
              <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                {coverFlash}
              </p>
            )}
            {openDetail.error && <p className="mb-3 text-xs text-rose-600">{t("photos.icloudError")}</p>}
            {pageError && <p className="mb-3 text-xs text-rose-600">{pageError}</p>}
            {detailLoading && <p className="mb-3 text-xs text-sky-700">{t("photos.loading")}</p>}
            {!detailLoading && !openDetail.error && openPhotos.length === 0 && (
              <p className="rounded-2xl bg-white px-4 py-10 text-center text-sm text-neutral-500 shadow-sm ring-1 ring-black/5">
                {t("photos.icloudEmpty")}
              </p>
            )}
            {openPhotos.length > 0 && (
              <div className={`grid grid-cols-3 gap-1.5 ${pickingCover ? "rounded-xl ring-2 ring-indigo-300 ring-offset-2" : ""}`}>
                {openPhotos.map((p, photoIndex) => {
                  const isCover = openDetail.coverPhotoId === p.id;
                  const isSelecting = pickingCoverId === p.id;
                  return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={icloudSaving}
                    onClick={() => {
                      if (pickingCover) {
                        void handleSetCover(p.id);
                        return;
                      }
                      if (isDrillInGhostClick(albumOpenedAt.current)) return;
                      setViewer({ index: photoIndex });
                    }}
                    className={`relative aspect-square overflow-hidden rounded-lg bg-neutral-100 ${
                      pickingCover
                        ? isCover
                          ? "ring-2 ring-indigo-500"
                          : "opacity-90"
                        : isCover
                          ? "ring-2 ring-indigo-400"
                          : ""
                    }`}
                  >
                    <img
                      src={p.thumbUrl}
                      alt={p.caption ?? t("photos.noCaption")}
                      referrerPolicy="no-referrer"
                      className={`h-full w-full object-cover ${pickingCover && !isCover ? "brightness-90" : ""}`}
                    />
                    {isCover && (
                      <span className="absolute left-1 top-1 rounded bg-indigo-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {t("photos.icloudCoverBadge")}
                      </span>
                    )}
                    {pickingCover && (
                      <span className="absolute inset-x-0 bottom-0 bg-black/45 px-1 py-0.5 text-center text-[10px] font-semibold text-white">
                        {isSelecting ? t("photos.icloudSaving") : t("photos.icloudTapToSetCover")}
                      </span>
                    )}
                  </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="rounded-2xl bg-sky-50 px-4 py-3">
              <p className="text-xs leading-relaxed text-sky-950">{t("photos.icloudHowTo")}</p>
              <button
                type="button"
                onClick={() => setShowHowTo(true)}
                className="mt-2 text-xs font-bold text-sky-800 underline"
              >
                {t("photos.icloudHowToShow")}
              </button>
            </div>
            {albumSummaries.length === 0 ? null : (
              <p className="mt-3 text-xs leading-relaxed text-neutral-500">{t("photos.hint")}</p>
            )}
            {albumSummaries.length === 0 && (
              <button
                type="button"
                onClick={openAddForm}
                className="mt-4 w-full rounded-xl bg-sky-700 py-2.5 text-sm font-semibold text-white"
              >
                {t("photos.icloudSave")}
              </button>
            )}
            {icloudLoading && <p className="mt-3 text-xs text-sky-700">{t("photos.loading")}</p>}
            {icloudError && !icloudFormOpen && !renameAlbum && (
              <p className="mt-2 text-xs text-rose-600">{icloudError}</p>
            )}
            {pageError && <p className="mt-2 text-xs text-rose-600">{pageError}</p>}
            {albumSummaries.length > 0 && token && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {albumSummaries.map((album) => (
                  <div
                    key={album.id}
                    className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenDetail({ ...album, photos: [] })}
                      className="block w-full text-left"
                    >
                      <div className="aspect-[4/3] bg-neutral-100">
                        <AlbumCardCover
                          token={token}
                          coverUrl={album.coverUrl}
                          coverPhotoId={album.coverPhotoId}
                          alt={album.name || t("photos.icloudTitle")}
                        />
                      </div>
                      <div className="px-2.5 py-2">
                        <p className="truncate text-sm font-semibold text-neutral-900">
                          {album.name || t("photos.icloudTitle")}
                        </p>
                        <p className="mt-0.5 text-[11px] text-neutral-400">
                          {photoCountLabel(album.photoCount)}
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
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {viewer && viewerPhotos.length > 0 && openDetail && (
        <PhotoLightbox
          photos={viewerPhotos}
          index={viewerIndex}
          albumTitle={openDetail.name ?? undefined}
          onIndexChange={(next) => setViewer({ index: next })}
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
          onEdit={() => openEditUrlForm(albumMenu)}
          onDelete={() => {
            setConfirmUnlink(albumMenu);
            setAlbumMenu(null);
          }}
        >
          <DetailRow label={t("photos.icloudTitle")}>{photoCountLabel(albumMenu.photoCount)}</DetailRow>
          <button
            type="button"
            onClick={() => openRenameForm(albumMenu)}
            className="mt-3 w-full rounded-xl bg-indigo-50 py-2.5 text-sm font-semibold text-indigo-700"
          >
            {t("photos.icloudRename")}
          </button>
          <button
            type="button"
            onClick={() => {
              const album = albumMenu;
              setAlbumMenu(null);
              setOpenDetail({ ...album, photos: [] });
              setPickingCover(true);
            }}
            className="mt-3 w-full rounded-xl bg-neutral-100 py-2.5 text-sm font-semibold text-neutral-800"
          >
            {t("photos.icloudPickCover")}
          </button>
        </ItemDetailSheet>
      )}

      {showHowTo && (
        <OverlayScrim
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onDismiss={() => setShowHowTo(false)}
          label={t("photos.cancel")}
        >
          <div className="relative z-10 max-h-[var(--sheet-max-height,85vh)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-bold text-neutral-900">{t("photos.icloudHowToTitle")}</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-neutral-700">
              {t("photos.icloudHowToSteps")}
            </p>
            <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
              {t("photos.icloudHowToTip")}
            </p>
            <button
              type="button"
              onClick={() => setShowHowTo(false)}
              className="mt-4 w-full rounded-xl bg-sky-700 py-2.5 text-sm font-semibold text-white"
            >
              {t("photos.cancel")}
            </button>
          </div>
        </OverlayScrim>
      )}

      {icloudFormOpen && (
        <OverlayScrim
          className="fixed inset-0 z-[55] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onDismiss={closeForm}
          label={t("photos.cancel")}
        >
          <form
            ref={icloudFormRef}
            onSubmit={(e) => void handleSaveIcloud(e)}
            className="relative max-h-[var(--sheet-max-height,90vh)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
            style={{ overflowAnchor: "none" }}
          >
            <h2 className="text-base font-bold text-neutral-900">
              {editingUrlAlbum ? t("photos.icloudChange") : t("photos.icloudAdd")}
            </h2>
            {!editingUrlAlbum && (
              <button
                type="button"
                onClick={() => setShowHowTo(true)}
                className="mt-2 text-xs font-semibold text-sky-700 underline"
              >
                {t("photos.icloudHowToShow")}
              </button>
            )}
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
                  : editingUrlAlbum
                    ? t("photos.save")
                    : t("photos.icloudSave")}
              </button>
            </div>
          </form>
        </OverlayScrim>
      )}

      {renameAlbum && (
        <OverlayScrim
          className="fixed inset-0 z-[55] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onDismiss={() => setRenameAlbum(null)}
          label={t("photos.cancel")}
        >
          <form
            ref={renameFormRef}
            onSubmit={(e) => void handleRename(e)}
            className="relative max-h-[var(--sheet-max-height,90vh)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
            style={{ overflowAnchor: "none" }}
          >
            <h2 className="text-base font-bold text-neutral-900">{t("photos.icloudRename")}</h2>
            <input
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              className="mt-3 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-sky-400"
              autoFocus
            />
            {icloudError && <p className="mt-2 text-xs text-rose-600">{icloudError}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setRenameAlbum(null)}
                className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-600"
              >
                {t("photos.cancel")}
              </button>
              <button
                type="submit"
                disabled={icloudSaving}
                className="flex-1 rounded-xl bg-sky-700 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {t("photos.save")}
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
