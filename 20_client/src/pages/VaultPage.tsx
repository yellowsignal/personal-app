import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Copy, Eye, EyeOff, KeyRound, MoreHorizontal, Plus, X } from "lucide-react";
import TopBar from "../components/TopBar";
import OverlayScrim from "../components/OverlayScrim";
import ItemDetailSheet, { DetailRow } from "../components/ItemDetailSheet";
import { useLanguage } from "../i18n/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { useResetWindowScroll } from "../hooks/useBodyScrollLock";
import { useKeepFocusedInScrollParent } from "../hooks/useKeepFocusedInScrollParent";
import { ApiError } from "../api/http";
import {
  vaultApi,
  type PublicVaultItem,
  type VaultCategory,
  type VaultItemInput,
} from "../api/vault";

const CATEGORIES: VaultCategory[] = ["LOGIN", "PRODUCT_KEY", "OTHER"];

export default function VaultPage() {
  const { t } = useLanguage();
  const { token } = useAuth();
  useResetWindowScroll("vault");

  const [items, setItems] = useState<PublicVaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PublicVaultItem | null>(null);
  const [detail, setDetail] = useState<PublicVaultItem | null>(null);
  const [menuFor, setMenuFor] = useState<PublicVaultItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PublicVaultItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [revealed, setRevealed] = useState<{ loginId: string | null; secret: string | null } | null>(
    null,
  );
  const [copied, setCopied] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<VaultCategory>("LOGIN");
  const [url, setUrl] = useState("");
  const [loginId, setLoginId] = useState("");
  const [secret, setSecret] = useState("");
  const [memo, setMemo] = useState("");
  const [secretDirty, setSecretDirty] = useState(false);

  const formScrollRef = useRef<HTMLFormElement>(null);
  useKeepFocusedInScrollParent(showForm, formScrollRef);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await vaultApi.list(token));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("vault.loadError"));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setTitle("");
    setCategory("LOGIN");
    setUrl("");
    setLoginId("");
    setSecret("");
    setMemo("");
    setSecretDirty(false);
    setShowForm(true);
  }

  function openEdit(item: PublicVaultItem) {
    setMenuFor(null);
    setDetail(null);
    setEditing(item);
    setTitle(item.title);
    setCategory(item.category);
    setUrl(item.url ?? "");
    setLoginId("");
    setSecret("");
    setMemo(item.memo ?? "");
    setSecretDirty(false);
    setShowForm(true);
  }

  function openDetail(item: PublicVaultItem) {
    setDetail(item);
    setRevealed(null);
    setCopied(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const body: VaultItemInput = {
        title: title.trim(),
        category,
        url: url.trim() || undefined,
        memo: memo.trim() || undefined,
      };
      if (editing) {
        if (loginId.trim()) body.loginId = loginId.trim();
        if (secretDirty) body.secret = secret;
        await vaultApi.update(token, editing.id, body);
      } else {
        body.loginId = loginId.trim() || undefined;
        body.secret = secret || undefined;
        await vaultApi.create(token, body);
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("vault.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(item: PublicVaultItem) {
    if (!token) return;
    setSaving(true);
    try {
      await vaultApi.remove(token, item.id);
      setConfirmDelete(null);
      setDetail(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("vault.deleteError"));
    } finally {
      setSaving(false);
    }
  }

  async function onReveal() {
    if (!token || !detail) return;
    setRevealing(true);
    setError(null);
    try {
      setRevealed(await vaultApi.revealCredentials(token, detail.id));
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null;
      setError(
        code === "PASSKEY_REQUIRED" ? t("vault.passkeyRequired") : t("vault.revealError"),
      );
    } finally {
      setRevealing(false);
    }
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  }

  const secretLabel =
    category === "PRODUCT_KEY" ? t("vault.fieldProductKey") : t("vault.fieldPassword");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar
        title={t("vault.title")}
        subtitle={t("vault.subtitle")}
        right={
          <button
            type="button"
            onClick={openCreate}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white"
            aria-label={t("vault.add")}
          >
            <Plus size={18} />
          </button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-3">
        <p className="mb-3 text-xs leading-relaxed text-neutral-500">{t("vault.personalOnlyHint")}</p>
        {error ? <p className="mb-3 text-xs text-rose-500">{error}</p> : null}
        {loading ? (
          <p className="py-12 text-center text-xs text-neutral-400">{t("vault.loading")}</p>
        ) : items.length === 0 ? (
          <p className="py-12 text-center text-xs text-neutral-400">{t("vault.empty")}</p>
        ) : (
          <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            {items.map((item) => (
              <li key={item.id} className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => openDetail(item)}
                  className="min-w-0 flex-1 px-4 py-3.5 text-left active:bg-neutral-50"
                >
                  <div className="flex items-center gap-2">
                    <KeyRound size={16} className="shrink-0 text-indigo-500" />
                    <p className="truncate text-sm font-semibold text-neutral-900">{item.title}</p>
                  </div>
                  <p className="mt-1 text-[11px] text-neutral-400">
                    {t(`vault.category.${item.category}`)}
                    {item.url ? ` · ${item.url.replace(/^https?:\/\//, "")}` : ""}
                  </p>
                </button>
                <button
                  type="button"
                  className="px-3 text-neutral-300"
                  aria-label={t("vault.more")}
                  onClick={() => setMenuFor(item)}
                >
                  <MoreHorizontal size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showForm && (
        <OverlayScrim
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center"
          onDismiss={() => setShowForm(false)}
          label={t("vault.cancelAction")}
        >
          <form
            ref={formScrollRef}
            onSubmit={(e) => void onSubmit(e)}
            className="relative max-h-[var(--sheet-max-height,80vh)] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 pb-8 shadow-xl sm:rounded-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">
                {editing ? t("vault.edit") : t("vault.add")}
              </h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-neutral-400">
                <X size={18} />
              </button>
            </div>

            <label className="block text-xs font-medium text-neutral-500">{t("vault.fieldTitle")}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
              placeholder={t("vault.titlePlaceholder")}
            />

            <p className="mt-4 text-xs font-medium text-neutral-500">{t("vault.fieldCategory")}</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    category === c
                      ? "bg-indigo-500 text-white"
                      : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {t(`vault.category.${c}`)}
                </button>
              ))}
            </div>

            <label className="mt-4 block text-xs font-medium text-neutral-500">{t("vault.fieldUrl")}</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
              placeholder="https://"
              inputMode="url"
              autoCapitalize="off"
            />

            <label className="mt-4 block text-xs font-medium text-neutral-500">
              {t("vault.fieldLoginId")}
            </label>
            <input
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
              placeholder={
                editing && !loginId ? t("vault.loginIdKeepHint") : t("vault.loginIdPlaceholder")
              }
              autoCapitalize="off"
              autoCorrect="off"
            />

            <label className="mt-4 block text-xs font-medium text-neutral-500">{secretLabel}</label>
            <input
              type="password"
              value={secret}
              onChange={(e) => {
                setSecret(e.target.value);
                setSecretDirty(true);
              }}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
              placeholder={
                editing && !secretDirty ? t("vault.secretKeepHint") : t("vault.secretPlaceholder")
              }
              autoCapitalize="off"
              autoCorrect="off"
            />
            <p className="mt-1 text-[11px] text-neutral-400">{t("vault.secretsHint")}</p>

            <label className="mt-4 block text-xs font-medium text-neutral-500">{t("vault.fieldMemo")}</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm"
            />

            <button
              type="submit"
              disabled={saving}
              className="mt-5 w-full rounded-xl bg-indigo-500 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving ? t("vault.saving") : t("vault.save")}
            </button>
          </form>
        </OverlayScrim>
      )}

      {detail && (
        <ItemDetailSheet
          title={detail.title}
          onClose={() => {
            setDetail(null);
            setRevealed(null);
          }}
          closeLabel={t("vault.cancelAction")}
          editLabel={t("vault.edit")}
          deleteLabel={t("vault.delete")}
          canManage
          onEdit={() => openEdit(detail)}
          onDelete={() => {
            setConfirmDelete(detail);
            setDetail(null);
          }}
        >
          <DetailRow label={t("vault.fieldCategory")}>{t(`vault.category.${detail.category}`)}</DetailRow>
          {detail.url ? <DetailRow label={t("vault.fieldUrl")}>{detail.url}</DetailRow> : null}
          {detail.memo ? <DetailRow label={t("vault.fieldMemo")}>{detail.memo}</DetailRow> : null}

          <div className="mt-4 rounded-xl bg-neutral-50 p-3">
            <p className="text-xs font-medium text-neutral-500">{t("vault.secretsSection")}</p>
            <p className="mt-1 text-[11px] text-neutral-400">{t("vault.secretsHint")}</p>
            {!revealed ? (
              <button
                type="button"
                disabled={revealing || (!detail.hasLoginId && !detail.hasSecret)}
                onClick={() => void onReveal()}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Eye size={16} />
                {revealing ? t("vault.loading") : t("vault.reveal")}
              </button>
            ) : (
              <div className="mt-2 space-y-2">
                {revealed.loginId ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[10px] text-neutral-400">{t("vault.fieldLoginId")}</p>
                      <p className="truncate text-sm font-medium text-neutral-900">{revealed.loginId}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyText("id", revealed.loginId!)}
                      className="shrink-0 text-indigo-500"
                      aria-label={t("vault.copy")}
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                ) : null}
                {revealed.secret ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[10px] text-neutral-400">
                        {detail.category === "PRODUCT_KEY"
                          ? t("vault.fieldProductKey")
                          : t("vault.fieldPassword")}
                      </p>
                      <p className="break-all text-sm font-medium text-neutral-900">{revealed.secret}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyText("secret", revealed.secret!)}
                      className="shrink-0 text-indigo-500"
                      aria-label={t("vault.copy")}
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => setRevealed(null)}
                  className="flex w-full items-center justify-center gap-1 text-xs text-neutral-500"
                >
                  <EyeOff size={14} />
                  {t("vault.hide")}
                </button>
                {copied ? <p className="text-center text-[11px] text-emerald-600">{t("vault.copied")}</p> : null}
              </div>
            )}
          </div>
        </ItemDetailSheet>
      )}

      {menuFor && (
        <OverlayScrim
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40"
          onDismiss={() => setMenuFor(null)}
          label={t("vault.cancelAction")}
        >
          <div className="w-full max-w-md rounded-t-2xl bg-white p-4 pb-8">
            <button
              type="button"
              className="w-full rounded-xl py-3 text-left text-sm font-semibold text-neutral-800"
              onClick={() => openEdit(menuFor)}
            >
              {t("vault.edit")}
            </button>
            <button
              type="button"
              className="w-full rounded-xl py-3 text-left text-sm font-semibold text-rose-600"
              onClick={() => {
                setConfirmDelete(menuFor);
                setMenuFor(null);
              }}
            >
              {t("vault.delete")}
            </button>
          </div>
        </OverlayScrim>
      )}

      {confirmDelete && (
        <OverlayScrim
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
          onDismiss={() => setConfirmDelete(null)}
          swipeToDismiss={false}
          label={t("vault.cancelAction")}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <p className="text-sm font-semibold text-neutral-900">
              {t("vault.deleteConfirm", { name: confirmDelete.title })}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl bg-neutral-100 py-2.5 text-sm font-semibold"
                onClick={() => setConfirmDelete(null)}
              >
                {t("vault.cancelAction")}
              </button>
              <button
                type="button"
                disabled={saving}
                className="flex-1 rounded-xl bg-rose-500 py-2.5 text-sm font-semibold text-white"
                onClick={() => void onDelete(confirmDelete)}
              >
                {t("vault.delete")}
              </button>
            </div>
          </div>
        </OverlayScrim>
      )}
    </div>
  );
}
