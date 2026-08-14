import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Cloud, Download, ImagePlus, Plus, X } from "lucide-react";
import TopBar from "../components/TopBar";
import ScopeToggle, { type ViewScope } from "../components/ScopeToggle";
import SharedBadge from "../components/SharedBadge";
import OverlayScrim from "../components/OverlayScrim";
import ItemDetailSheet, { DetailRow } from "../components/ItemDetailSheet";
import { useLanguage } from "../i18n/LanguageContext";
import { useAuth } from "../context/AuthContext";
import {
  photosApi,
  type IcloudAlbumPhoto,
  type LinkedIcloudAlbum,
  type PublicPhoto,
} from "../api/photos";
import { ApiError } from "../api/http";
import { MAX_ICLOUD_ALBUMS, MAX_PHOTO_UPLOAD, saveBlobLocally, selectImageFiles } from "../utils/photoUpload";

function usePhotoObjectUrls(token: string | null, ids: number[]) {
  const [urls, setUrls] = useState<Record<number, string>>({});
  const idsKey = ids.join(",");

  useEffect(() => {
    if (!token || ids.length === 0) {
      setUrls({});
      return;
    }
    let cancelled = false;
    const created: string[] = [];
    void (async () => {
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const blob = await photosApi.downloadFile(token, id);
            const url = URL.createObjectURL(blob);
            created.push(url);
            return [id, url] as const;
          } catch {
            return [id, ""] as const;
          }
        }),
      );
      if (cancelled) {
        for (const u of created) URL.revokeObjectURL(u);
        return;
      }
      const next: Record<number, string> = {};
      for (const [id, url] of entries) {
        if (url) next[id] = url;
      }
      setUrls(next);
    })();
    return () => {
      cancelled = true;
      for (const u of created) URL.revokeObjectURL(u);
    };
  }, [token, idsKey]);

  return urls;
}

function formatPhotoDate(iso: string, lang: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(lang === "ja" ? "ja-JP" : "ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PhotosPage() {
  const { t, lang } = useLanguage();
  const { token, family } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scope, setScope] = useState<ViewScope>("all");
  const [items, setItems] = useState<PublicPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<PublicPhoto | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PublicPhoto | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PublicPhoto | null>(null);
  const [pickFiles, setPickFiles] = useState<File[]>([]);
  const [pickPreviews, setPickPreviews] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [icloudAlbums, setIcloudAlbums] = useState<LinkedIcloudAlbum[]>([]);
  const [icloudLoading, setIcloudLoading] = useState(false);
  const [icloudDraft, setIcloudDraft] = useState("");
  const [icloudFormOpen, setIcloudFormOpen] = useState(false);
  const [icloudSaving, setIcloudSaving] = useState(false);
  const [icloudError, setIcloudError] = useState<string | null>(null);
  const [icloudDetail, setIcloudDetail] = useState<{
    album: LinkedIcloudAlbum;
    photo: IcloudAlbumPhoto;
  } | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState<LinkedIcloudAlbum | null>(null);
  const [icloudDownloading, setIcloudDownloading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await photosApi.list(token, scope);
      setItems(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("photos.errorLoad"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, scope, t]);

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
    void load();
  }, [load]);

  useEffect(() => {
    void loadIcloud();
  }, [loadIcloud]);

  const ids = useMemo(() => items.map((p) => p.id), [items]);
  const urls = usePhotoObjectUrls(token, ids);

  useEffect(() => {
    const raw = searchParams.get("id");
    if (!raw || items.length === 0) return;
    const id = Number(raw);
    if (!Number.isFinite(id)) return;
    const found = items.find((p) => p.id === id);
    if (!found) return;
    setDetail(found);
    const next = new URLSearchParams(searchParams);
    next.delete("id");
    setSearchParams(next, { replace: true });
  }, [items, searchParams, setSearchParams]);

  useEffect(() => {
    if (pickFiles.length === 0) {
      setPickPreviews([]);
      return;
    }
    const created = pickFiles.map((file) => URL.createObjectURL(file));
    setPickPreviews(created);
    return () => {
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [pickFiles]);

  function resetForm() {
    setFormOpen(false);
    setEditing(null);
    setPickFiles([]);
    setCaption("");
    setIsShared(Boolean(family));
    setFormError(null);
    setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openCreatePicker() {
    fileInputRef.current?.click();
  }

  function onFilesPicked(list: FileList | null) {
    if (!list || list.length === 0) return;
    const selected = selectImageFiles(list);
    if (selected.files.length === 0) {
      setError(t("photos.needImage"));
      return;
    }
    setEditing(null);
    setPickFiles(selected.files);
    setCaption("");
    setIsShared(Boolean(family));
    setFormError(
      selected.truncated > 0 ? t("photos.truncated", { max: MAX_PHOTO_UPLOAD }) : null,
    );
    setFormOpen(true);
  }

  function openEdit(photo: PublicPhoto) {
    setDetail(null);
    setEditing(photo);
    setPickFiles([]);
    setCaption(photo.caption ?? "");
    setIsShared(photo.isShared);
    setFormError(null);
    setFormOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!token || submitting) return;
    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) {
        const updated = await photosApi.update(token, editing.id, {
          caption: caption.trim() || null,
          isShared,
        });
        setItems((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        setDetail(updated);
      } else {
        if (pickFiles.length === 0) {
          setFormError(t("photos.needImage"));
          setSubmitting(false);
          return;
        }
        let ok = 0;
        let fail = 0;
        let last: PublicPhoto | null = null;
        for (let i = 0; i < pickFiles.length; i++) {
          setUploadProgress({ current: i + 1, total: pickFiles.length });
          try {
            last = await photosApi.upload(token, pickFiles[i], {
              caption: caption.trim() || undefined,
              isShared,
            });
            ok += 1;
          } catch {
            fail += 1;
          }
        }
        await load();
        if (ok === 0) {
          setFormError(t("photos.errorSave"));
          setSubmitting(false);
          return;
        }
        if (last) setDetail(last);
        if (fail > 0) setError(t("photos.partialUpload", { ok, fail }));
      }
      resetForm();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("photos.errorSave"));
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  }

  async function handleDeleteConfirmed() {
    if (!token || !confirmDelete || !confirmDelete.editable) return;
    setSubmitting(true);
    try {
      await photosApi.remove(token, confirmDelete.id);
      setItems((prev) => prev.filter((p) => p.id !== confirmDelete.id));
      if (detail?.id === confirmDelete.id) setDetail(null);
      setConfirmDelete(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("photos.errorDelete"));
      setConfirmDelete(null);
    } finally {
      setSubmitting(false);
    }
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
      if (icloudDetail?.album.id === confirmUnlink.id) setIcloudDetail(null);
      setConfirmUnlink(null);
    } catch (err) {
      setIcloudError(err instanceof ApiError ? err.message : t("photos.icloudError"));
      setConfirmUnlink(null);
    } finally {
      setIcloudSaving(false);
    }
  }

  async function handleDownloadIcloud() {
    if (!token || !icloudDetail || icloudDownloading) return;
    setIcloudDownloading(true);
    try {
      const blob = await photosApi.downloadIcloudPhoto(token, icloudDetail.album.id, icloudDetail.photo.id);
      const name = `${icloudDetail.photo.caption || icloudDetail.album.name || "icloud"}.jpg`;
      await saveBlobLocally(blob, name);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("photos.icloudDownloadError"));
    } finally {
      setIcloudDownloading(false);
    }
  }

  const liveDetail = detail ? (items.find((p) => p.id === detail.id) ?? detail) : null;
  const canAddAlbum = icloudAlbums.length < MAX_ICLOUD_ALBUMS;
  const formTitle = editing
    ? t("photos.edit")
    : pickFiles.length > 1
      ? t("photos.addCount", { n: pickFiles.length })
      : t("photos.add");

  return (
    <div>
      <TopBar
        title={t("photos.title")}
        subtitle={t("photos.subtitle")}
        right={
          <button
            type="button"
            onClick={openCreatePicker}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white"
            aria-label={t("photos.add")}
          >
            <Plus size={18} />
          </button>
        }
      />

      <div className="mx-auto max-w-md px-4 pt-4 pb-8">
        <ScopeToggle value={scope} onChange={setScope} />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const list = e.target.files;
            e.target.value = "";
            onFilesPicked(list);
          }}
        />

        {family ? (
          <section className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="flex items-center gap-1.5 text-sm font-bold text-sky-900">
                <Cloud size={16} />
                {t("photos.icloudTitle")}
              </p>
              {canAddAlbum && icloudAlbums.length > 0 && !icloudFormOpen && (
                <button
                  type="button"
                  onClick={() => {
                    setIcloudDraft("");
                    setIcloudError(null);
                    setIcloudFormOpen(true);
                  }}
                  className="text-xs font-semibold text-sky-700"
                >
                  {t("photos.icloudAdd")}
                </button>
              )}
            </div>
            {icloudAlbums.length === 0 && !icloudFormOpen && (
              <>
                <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-sky-800">
                  {t("photos.icloudHowTo")}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setIcloudDraft("");
                    setIcloudError(null);
                    setIcloudFormOpen(true);
                  }}
                  className="mt-3 w-full rounded-xl bg-sky-700 py-2.5 text-sm font-semibold text-white"
                >
                  {t("photos.icloudSave")}
                </button>
              </>
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
                    {album.photos.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setIcloudDetail({ album, photo: p })}
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
          <p className="mt-4 rounded-2xl bg-neutral-50 px-4 py-3 text-xs text-neutral-500">
            {t("photos.icloudNeedFamily")}
          </p>
        )}

        <button
          type="button"
          onClick={openCreatePicker}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-4 text-sm font-bold text-white shadow-sm"
        >
          <ImagePlus size={18} />
          {t("photos.add")}
        </button>
        <p className="mt-2 rounded-2xl bg-indigo-50/60 px-4 py-3 text-xs text-indigo-700">{t("photos.hint")}</p>

        <h2 className="mt-6 text-sm font-bold text-neutral-800">{t("photos.deviceSection")}</h2>
        {loading && <p className="mt-6 text-center text-sm text-neutral-400">{t("photos.loading")}</p>}
        {error && <p className="mt-4 text-center text-sm text-rose-600">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="mt-8 text-center text-sm text-neutral-400">{t("photos.empty")}</p>
        )}

        <div className="mt-4 grid grid-cols-3 gap-1.5">
          {items.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setDetail(p)}
              className="group relative aspect-square overflow-hidden rounded-lg bg-neutral-100"
            >
              {urls[p.id] ? (
                <img src={urls[p.id]} alt={p.caption ?? t("photos.noCaption")} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-neutral-200" />
              )}
              {p.isShared && (
                <span className="absolute right-1 top-1 rounded-full bg-black/30 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  {t("photos.familyBadge")}
                </span>
              )}
              {p.caption && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-3">
                  <p className="truncate text-left text-[10px] font-medium text-white">{p.caption}</p>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {formOpen && (
        <OverlayScrim
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          onDismiss={resetForm}
          label={t("photos.cancel")}
        >
          <form
            onSubmit={(e) => void handleSave(e)}
            className="relative w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">{formTitle}</h2>
              <button type="button" onClick={resetForm} className="rounded-full p-1 text-neutral-400" aria-label={t("photos.cancel")}>
                <X size={18} />
              </button>
            </div>
            {pickPreviews.length > 1 && (
              <div className="mb-3 grid grid-cols-4 gap-1.5">
                {pickPreviews.map((src) => (
                  <img key={src} src={src} alt="" className="aspect-square w-full rounded-lg object-cover bg-neutral-50" />
                ))}
              </div>
            )}
            {(pickPreviews.length === 1 || (editing && urls[editing.id])) && (
              <img
                src={pickPreviews[0] ?? urls[editing!.id]}
                alt=""
                className="mb-3 max-h-64 w-full rounded-xl object-contain bg-neutral-50"
              />
            )}
            <label className="text-xs font-semibold text-neutral-500">{t("photos.caption")}</label>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={200}
              placeholder={t("photos.captionPlaceholder")}
              className="mt-1 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
            />
            <label className={`mt-4 flex items-center gap-2 text-sm ${family ? "text-neutral-700" : "text-neutral-400"}`}>
              <input
                type="checkbox"
                checked={isShared}
                disabled={!family}
                onChange={(e) => setIsShared(e.target.checked)}
                className="rounded border-neutral-300"
              />
              {t("photos.shareWithFamily")}
            </label>
            {!family && <p className="mt-1 text-[11px] text-neutral-400">{t("photos.needFamilyToShare")}</p>}
            {formError && <p className="mt-3 text-sm text-rose-600">{formError}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="mt-4 w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting
                ? uploadProgress
                  ? t("photos.savingCount", uploadProgress)
                  : t("photos.saving")
                : editing
                  ? t("photos.save")
                  : pickFiles.length > 1
                    ? t("photos.addCount", { n: pickFiles.length })
                    : t("photos.save")}
            </button>
          </form>
        </OverlayScrim>
      )}

      {liveDetail && (
        <ItemDetailSheet
          title={liveDetail.caption || t("photos.noCaption")}
          onClose={() => setDetail(null)}
          onEdit={liveDetail.editable ? () => openEdit(liveDetail) : undefined}
          onDelete={liveDetail.editable ? () => setConfirmDelete(liveDetail) : undefined}
          canManage={liveDetail.editable}
          closeLabel={t("photos.cancel")}
          editLabel={t("photos.edit")}
          deleteLabel={t("photos.delete")}
        >
          {urls[liveDetail.id] ? (
            <img
              src={urls[liveDetail.id]}
              alt={liveDetail.caption ?? t("photos.noCaption")}
              className="mb-3 max-h-[50vh] w-full rounded-xl object-contain bg-neutral-50"
            />
          ) : (
            <div className="mb-3 h-40 rounded-xl bg-neutral-100" />
          )}
          <DetailRow label={t("photos.shareWithFamily")}>
            <SharedBadge isShared={liveDetail.isShared} />
          </DetailRow>
          <DetailRow label={t("photos.registeredBy")}>{liveDetail.ownerName}</DetailRow>
          <DetailRow label={t("photos.addedAt")}>{formatPhotoDate(liveDetail.createdAt, lang)}</DetailRow>
        </ItemDetailSheet>
      )}

      {icloudDetail && (
        <ItemDetailSheet
          title={icloudDetail.photo.caption || icloudDetail.album.name || t("photos.icloudTitle")}
          onClose={() => setIcloudDetail(null)}
          closeLabel={t("photos.cancel")}
          editLabel={t("photos.edit")}
          deleteLabel={t("photos.delete")}
        >
          <img
            src={icloudDetail.photo.fullUrl}
            alt={icloudDetail.photo.caption ?? t("photos.noCaption")}
            referrerPolicy="no-referrer"
            className="mb-3 max-h-[50vh] w-full rounded-xl object-contain bg-neutral-50"
          />
          {icloudDetail.photo.date && (
            <DetailRow label={t("photos.addedAt")}>{formatPhotoDate(icloudDetail.photo.date, lang)}</DetailRow>
          )}
          <button
            type="button"
            disabled={icloudDownloading}
            onClick={() => void handleDownloadIcloud()}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-sky-700 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Download size={16} />
            {icloudDownloading ? t("photos.icloudDownloading") : t("photos.icloudDownload")}
          </button>
        </ItemDetailSheet>
      )}

      {confirmDelete && (
        <OverlayScrim
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onDismiss={() => setConfirmDelete(null)}
          label={t("photos.cancel")}
          swipeToDismiss={false}
        >
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-bold text-neutral-900">{t("photos.delete")}</h2>
            <p className="mt-2 text-sm text-neutral-500">
              {t("photos.deleteConfirm", { name: confirmDelete.caption || t("photos.noCaption") })}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-600"
              >
                {t("photos.cancel")}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleDeleteConfirmed()}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {t("photos.delete")}
              </button>
            </div>
          </div>
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
