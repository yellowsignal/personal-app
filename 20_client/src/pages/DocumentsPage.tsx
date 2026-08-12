import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Camera, Copy, Eye, EyeOff, Plus, Trash2, X } from "lucide-react";
import TopBar from "../components/TopBar";
import ScopeToggle, { type ViewScope } from "../components/ScopeToggle";
import SharedBadge from "../components/SharedBadge";
import { useLanguage } from "../i18n/LanguageContext";
import { useAuth } from "../context/AuthContext";
import {
  DOCUMENT_TYPE_SUGGESTIONS,
  documentsApi,
  type CreateDocumentInput,
  type DocumentFieldInput,
  type PublicDocument,
} from "../api/documents";
import { ApiError } from "../api/http";
import { isPasskeySupported } from "../api/passkey";

interface FieldDraft {
  key: string;
  id?: string;
  label: string;
  value: string;
  isSecret: boolean;
}

function emptyField(): FieldDraft {
  return { key: crypto.randomUUID(), label: "", value: "", isSecret: true };
}

function todayIsoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function maskSecret(): string {
  return "••••••••";
}

export default function DocumentsPage() {
  const { t } = useLanguage();
  const { token, family } = useAuth();
  const [scope, setScope] = useState<ViewScope>("all");
  const [items, setItems] = useState<PublicDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [typeLabel, setTypeLabel] = useState("");
  const [fieldDrafts, setFieldDrafts] = useState<FieldDraft[]>([emptyField()]);
  const [expiryDate, setExpiryDate] = useState(() => todayIsoDate());
  const [hasExpiry, setHasExpiry] = useState(true);
  const [isShared, setIsShared] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [revealedByDoc, setRevealedByDoc] = useState<Record<number, Record<string, string>>>({});
  const [revealBusyId, setRevealBusyId] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await documentsApi.list(token, scope);
      setItems(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("documents.errorLoad"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, scope, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const daysLeft = useCallback((isoDate: string | null) => {
    if (!isoDate) return Number.MAX_SAFE_INTEGER;
    const expiry = new Date(`${isoDate}T00:00:00.000Z`);
    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return Math.ceil((expiry.getTime() - todayUtc.getTime()) / (24 * 60 * 60 * 1000));
  }, []);

  const visible = useMemo(() => {
    return [...items].sort((a, b) => daysLeft(a.expiryDate) - daysLeft(b.expiryDate));
  }, [items, daysLeft]);

  function openCreate() {
    setTypeLabel("");
    setFieldDrafts([emptyField()]);
    setExpiryDate(todayIsoDate());
    setHasExpiry(true);
    setIsShared(false);
    setShowCreate(true);
  }

  function closeCreate() {
    setShowCreate(false);
    setSubmitting(false);
  }

  function updateField(key: string, patch: Partial<FieldDraft>) {
    setFieldDrafts((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }

  function addField() {
    setFieldDrafts((prev) => [...prev, emptyField()]);
  }

  function removeField(key: string) {
    setFieldDrafts((prev) => (prev.length <= 1 ? prev : prev.filter((f) => f.key !== key)));
  }

  function displayFieldValue(docId: number, field: PublicDocument["fields"][number]): string {
    if (!field.isSecret) return field.value ?? "—";
    const revealed = revealedByDoc[docId]?.[field.id];
    if (revealed !== undefined) return revealed || "—";
    return field.hasValue ? maskSecret() : "—";
  }

  function isFieldRevealed(docId: number, fieldId: string): boolean {
    return revealedByDoc[docId]?.[fieldId] !== undefined;
  }

  async function handleReveal(doc: PublicDocument) {
    if (!token) return;
    const currentlyRevealed = revealedByDoc[doc.id];
    if (currentlyRevealed) {
      setRevealedByDoc((prev) => {
        const next = { ...prev };
        delete next[doc.id];
        return next;
      });
      return;
    }
    if (!isPasskeySupported()) {
      setError(t("documents.passkeyRequired"));
      return;
    }
    setRevealBusyId(doc.id);
    setError(null);
    try {
      const result = await documentsApi.revealFields(token, doc.id);
      const map: Record<string, string> = {};
      for (const f of result.fields) map[f.id] = f.value;
      setRevealedByDoc((prev) => ({ ...prev, [doc.id]: map }));
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null;
      if (code === "PASSKEY_REQUIRED") {
        setError(t("documents.passkeyRequired"));
      } else {
        setError(err instanceof ApiError ? err.message : t("documents.revealError"));
      }
    } finally {
      setRevealBusyId(null);
    }
  }

  async function handleCopy(value: string, copyKey: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(copyKey);
      window.setTimeout(() => setCopiedKey((cur) => (cur === copyKey ? null : cur)), 1500);
    } catch {
      /* ignore */
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!token || submitting) return;
    if (!typeLabel.trim()) {
      setError(t("documents.typeLabelRequired"));
      return;
    }
    const fields: DocumentFieldInput[] = fieldDrafts
      .filter((f) => f.label.trim())
      .map((f) => ({
        label: f.label.trim(),
        isSecret: f.isSecret,
        value: f.value,
      }));
    if (fields.length === 0) {
      setError(t("documents.fieldsRequired"));
      return;
    }
    if (!fields.some((f) => f.value?.trim())) {
      setError(t("documents.fieldValueRequired"));
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      const payload: CreateDocumentInput = {
        typeLabel: typeLabel.trim(),
        fields,
        expiryDate: hasExpiry ? expiryDate : null,
        isShared,
      };
      await documentsApi.create(token, payload);
      closeCreate();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("documents.errorSave"));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    typeLabel.trim().length > 0 &&
    fieldDrafts.some((f) => f.label.trim() && f.value.trim());

  return (
    <div>
      <TopBar
        title={t("documents.title")}
        subtitle={t("documents.subtitle")}
        right={
          <button
            type="button"
            onClick={openCreate}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white"
            aria-label={t("documents.newDocument")}
          >
            <Plus size={18} />
          </button>
        }
      />

      <div className="mx-auto max-w-md px-4 pt-4 pb-8">
        <ScopeToggle value={scope} onChange={setScope} />

        <button className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-indigo-300 bg-indigo-50/60 py-3 text-sm font-semibold text-indigo-500">
          <Camera size={16} />
          {t("documents.ocrButton")}
        </button>

        <div className="mt-4 flex flex-col gap-3">
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</p>}
          {loading ? (
            <p className="py-10 text-center text-sm text-neutral-400">{t("documents.loading")}</p>
          ) : visible.length === 0 ? (
            <div className="rounded-2xl bg-white px-4 py-12 text-center shadow-sm ring-1 ring-black/5">
              <p className="text-sm font-medium text-neutral-600">{t("documents.empty")}</p>
            </div>
          ) : (
            visible.map((d) => {
              const dLeft = daysLeft(d.expiryDate);
              const urgent = d.expiryDate !== null && dLeft <= 30;
              const docRevealed = Boolean(revealedByDoc[d.id]);
              return (
                <div key={d.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-neutral-400">{d.ownerName}</p>
                      <p className="mt-0.5 text-sm font-bold text-neutral-900">{d.typeLabel}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {d.hasSecrets && (
                        <button
                          type="button"
                          onClick={() => void handleReveal(d)}
                          disabled={revealBusyId === d.id}
                          className="rounded-full p-2 text-neutral-400 hover:bg-neutral-50"
                          aria-label={docRevealed ? t("documents.hideSecrets") : t("documents.revealSecrets")}
                        >
                          {revealBusyId === d.id ? (
                            <span className="block h-[18px] w-[18px] animate-pulse rounded-full bg-neutral-200" />
                          ) : docRevealed ? (
                            <EyeOff size={18} />
                          ) : (
                            <Eye size={18} />
                          )}
                        </button>
                      )}
                      <SharedBadge isShared={d.isShared} />
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {d.fields.map((field) => {
                      const display = displayFieldValue(d.id, field);
                      const copyKey = `${d.id}-${field.id}`;
                      const showCopy = field.isSecret ? isFieldRevealed(d.id, field.id) && display !== "—" : display !== "—";
                      return (
                        <div key={field.id} className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[11px] font-medium text-neutral-400">{field.label}</p>
                            <p className="mt-0.5 break-all font-mono text-xs text-neutral-600">{display}</p>
                          </div>
                          {showCopy && (
                            <button
                              type="button"
                              onClick={() => void handleCopy(display, copyKey)}
                              className="shrink-0 rounded-full p-1.5 text-neutral-400 hover:bg-neutral-50"
                              aria-label={t("documents.copy")}
                            >
                              <Copy size={14} />
                            </button>
                          )}
                          {copiedKey === copyKey && (
                            <span className="text-[10px] text-indigo-500">{t("documents.copied")}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {d.expiryDate && (
                    <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3">
                      <span className="text-xs text-neutral-400">
                        {t("documents.expiryLabel", { date: d.expiryDate })}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          urgent ? "bg-rose-50 text-rose-500" : "bg-neutral-100 text-neutral-500"
                        }`}
                      >
                        D-{dLeft}
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center">
          <form
            onSubmit={handleCreate}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">{t("documents.newDocument")}</h2>
              <button type="button" onClick={closeCreate} aria-label={t("documents.cancel")} className="rounded-full p-2">
                <X size={18} className="text-neutral-400" />
              </button>
            </div>

            <label className="mb-2 block text-sm font-semibold text-neutral-700">{t("documents.fieldTypeLabel")}</label>
            <input
              list="document-type-suggestions"
              value={typeLabel}
              onChange={(e) => setTypeLabel(e.target.value)}
              placeholder={t("documents.placeholderTypeLabel")}
              className="mb-4 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
            />
            <datalist id="document-type-suggestions">
              {DOCUMENT_TYPE_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>

            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-semibold text-neutral-700">{t("documents.fieldItems")}</label>
              <button
                type="button"
                onClick={addField}
                className="flex items-center gap-1 text-xs font-semibold text-indigo-600"
              >
                <Plus size={14} />
                {t("documents.addField")}
              </button>
            </div>
            <p className="mb-3 text-[11px] text-neutral-400">{t("documents.fieldsHint")}</p>

            <div className="space-y-3">
              {fieldDrafts.map((field) => (
                <div key={field.key} className="rounded-xl border border-neutral-200 bg-neutral-50/80 p-3">
                  <div className="flex items-center gap-2">
                    <input
                      value={field.label}
                      onChange={(e) => updateField(field.key, { label: e.target.value })}
                      placeholder={t("documents.placeholderFieldLabel")}
                      className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-indigo-400"
                    />
                    {fieldDrafts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeField(field.key)}
                        className="rounded-full p-2 text-neutral-400 hover:bg-white"
                        aria-label={t("documents.removeField")}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <input
                    value={field.value}
                    onChange={(e) => updateField(field.key, { value: e.target.value })}
                    placeholder={t("documents.placeholderFieldValue")}
                    className="mt-2 w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-2 font-mono text-sm outline-none focus:border-indigo-400"
                  />
                  <label className="mt-2 flex items-center gap-2 text-xs text-neutral-600">
                    <input
                      type="checkbox"
                      checked={field.isSecret}
                      onChange={(e) => updateField(field.key, { isSecret: e.target.checked })}
                      className="rounded border-neutral-300"
                    />
                    {t("documents.fieldSecret")}
                  </label>
                </div>
              ))}
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={hasExpiry}
                onChange={(e) => setHasExpiry(e.target.checked)}
                className="rounded border-neutral-300"
              />
              {t("documents.hasExpiry")}
            </label>
            {hasExpiry && (
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
              />
            )}

            <label className={`mt-4 flex items-center gap-2 text-sm ${family ? "text-neutral-700" : "text-neutral-400"}`}>
              <input
                type="checkbox"
                checked={isShared}
                disabled={!family}
                onChange={(e) => setIsShared(e.target.checked)}
                className="rounded border-neutral-300"
              />
              {t("documents.shareWithFamily")}
            </label>

            <button
              type="submit"
              disabled={submitting || !canSubmit}
              className="mt-4 w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {t("documents.save")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
