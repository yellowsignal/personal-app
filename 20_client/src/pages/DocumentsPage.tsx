import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Camera, Plus, X } from "lucide-react";
import TopBar from "../components/TopBar";
import ScopeToggle, { type ViewScope } from "../components/ScopeToggle";
import SharedBadge from "../components/SharedBadge";
import { useLanguage } from "../i18n/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { documentsApi, type CreateDocumentInput, type DocumentType, type PublicDocument } from "../api/documents";
import { ApiError } from "../api/http";

export default function DocumentsPage() {
  const { t } = useLanguage();
  const { token, family } = useAuth();
  const [scope, setScope] = useState<ViewScope>("all");
  const [items, setItems] = useState<PublicDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [docType, setDocType] = useState<DocumentType>("license");
  const [docNumber, setDocNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState(() => todayIsoDate());
  const [isShared, setIsShared] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
    const diffMs = expiry.getTime() - todayUtc.getTime();
    return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  }, []);

  const visible = useMemo(() => {
    return [...items].sort((a, b) => daysLeft(a.expiryDate) - daysLeft(b.expiryDate));
  }, [items, daysLeft]);

  function openCreate() {
    setDocType("license");
    setDocNumber("");
    setExpiryDate(todayIsoDate());
    setIsShared(false);
    setShowCreate(true);
  }

  function closeCreate() {
    setShowCreate(false);
    setSubmitting(false);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!token || submitting) return;
    if (!docNumber.trim()) {
      setError(t("documents.docNumberRequired"));
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      const payload: CreateDocumentInput = {
        docType,
        docNumber: docNumber.trim(),
        expiryDate,
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

      <div className="mx-auto max-w-md px-4 pt-4">
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
              const urgent = dLeft <= 30;
              return (
                <div key={d.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[11px] font-semibold text-neutral-400">{d.ownerName}</p>
                      <p className="mt-0.5 text-sm font-bold text-neutral-900">{t(`documentType.${d.docType}`)}</p>
                      <p className="mt-0.5 font-mono text-xs text-neutral-400">{d.docNumber ?? "—"}</p>
                    </div>
                    <SharedBadge isShared={d.isShared} />
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-neutral-400">
                      {t("documents.expiryLabel", { date: d.expiryDate ?? "—" })}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        urgent ? "bg-rose-50 text-rose-500" : "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      D-{Number.isFinite(dLeft) ? dLeft : "—"}
                    </span>
                  </div>
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
            className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">{t("documents.newDocument")}</h2>
              <button type="button" onClick={closeCreate} aria-label={t("documents.cancel")} className="rounded-full p-2">
                <X size={18} className="text-neutral-400" />
              </button>
            </div>

            <label className="mb-3 block text-sm font-semibold text-neutral-700">{t("documents.fieldDocType")}</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value as DocumentType)}
              className="mb-4 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
            >
              {(["license", "passport", "idcard", "certificate"] as DocumentType[]).map((dt) => (
                <option key={dt} value={dt}>
                  {t(`documentType.${dt}`)}
                </option>
              ))}
            </select>

            <label className="mb-3 block text-sm font-semibold text-neutral-700">{t("documents.fieldDocNumber")}</label>
            <input
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value)}
              placeholder={t("documents.placeholderDocNumber")}
              className="mb-4 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
            />

            <label className="mb-3 block text-sm font-semibold text-neutral-700">{t("documents.fieldExpiryDate")}</label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="mb-4 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
            />

            <label className={`mt-1 flex items-center gap-2 text-sm ${family ? "text-neutral-700" : "text-neutral-400"}`}>
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
              disabled={submitting || !docNumber.trim()}
              className="mt-4 w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {submitting ? t("documents.save") : t("documents.save")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
