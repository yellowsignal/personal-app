import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ImagePlus, Plus, X } from "lucide-react";
import TopBar from "../components/TopBar";
import ScopeToggle, { type ViewScope } from "../components/ScopeToggle";
import SharedBadge from "../components/SharedBadge";
import OverlayScrim from "../components/OverlayScrim";
import ItemDetailSheet, { DetailRow } from "../components/ItemDetailSheet";
import { useLanguage } from "../i18n/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { photosApi, type PublicPhoto } from "../api/photos";
import { ApiError } from "../api/http";

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
  const [pickFile, setPickFile] = useState<File | null>(null);
  const [pickPreview, setPickPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    void load();
  }, [load]);

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
    if (!pickFile) {
      setPickPreview(null);
      return;
    }
    const url = URL.createObjectURL(pickFile);
    setPickPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pickFile]);

  function resetForm() {
    setFormOpen(false);
    setEditing(null);
    setPickFile(null);
    setCaption("");
    setIsShared(false);
    setFormError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openCreatePicker() {
    fileInputRef.current?.click();
  }

  function onFilePicked(file: File | undefined) {
    if (!file) return;
    setEditing(null);
    setPickFile(file);
    setCaption("");
    setIsShared(false);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(photo: PublicPhoto) {
    setDetail(null);
    setEditing(photo);
    setPickFile(null);
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
        if (!pickFile) {
          setFormError(t("photos.needImage"));
          setSubmitting(false);
          return;
        }
        const created = await photosApi.upload(token, pickFile, {
          caption: caption.trim() || undefined,
          isShared,
        });
        await load();
        setDetail(created);
      }
      resetForm();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : t("photos.errorSave"));
    } finally {
      setSubmitting(false);
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

  const liveDetail = detail ? (items.find((p) => p.id === detail.id) ?? detail) : null;

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
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            onFilePicked(file);
          }}
        />

        <button
          type="button"
          onClick={openCreatePicker}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-4 text-sm font-bold text-white shadow-sm"
        >
          <ImagePlus size={18} />
          {t("photos.add")}
        </button>
        <p className="mt-2 rounded-2xl bg-indigo-50/60 px-4 py-3 text-xs text-indigo-700">{t("photos.hint")}</p>

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
              <h2 className="text-base font-bold text-neutral-900">
                {editing ? t("photos.edit") : t("photos.add")}
              </h2>
              <button type="button" onClick={resetForm} className="rounded-full p-1 text-neutral-400" aria-label={t("photos.cancel")}>
                <X size={18} />
              </button>
            </div>
            {(pickPreview || (editing && urls[editing.id])) && (
              <img
                src={pickPreview ?? urls[editing!.id]}
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
              {submitting ? t("photos.saving") : t("photos.save")}
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
    </div>
  );
}
