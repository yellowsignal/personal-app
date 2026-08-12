import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Camera, Copy, Eye, EyeOff, FileDown, Plus, Trash2, X } from "lucide-react";
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
  type ScanSide,
} from "../api/documents";
import { ApiError } from "../api/http";
import { isPasskeySupported } from "../api/passkey";
import { imageFileToPdfBlob } from "../utils/imageToPdf";
import { mergePdfBlobs } from "../utils/pdfMerge";
import { runOcrOnFiles } from "../utils/documentOcr";
import { parseDocumentOcrText } from "../utils/documentOcrParse";

interface FieldDraft {
  key: string;
  id?: string;
  label: string;
  value: string;
  isSecret: boolean;
}

type ScanWizardTarget = { kind: "document"; docId: number } | { kind: "create"; withOcr?: boolean };

interface ScanWizardState {
  target: ScanWizardTarget;
  step: "front" | "back" | "review";
  frontFile: File | null;
  backFile: File | null;
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
  const [scanBusyId, setScanBusyId] = useState<number | null>(null);
  const [createScanFront, setCreateScanFront] = useState<File | null>(null);
  const [createScanBack, setCreateScanBack] = useState<File | null>(null);
  const [scanWizard, setScanWizard] = useState<ScanWizardState | null>(null);
  const [exportDoc, setExportDoc] = useState<PublicDocument | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const scanCaptureSideRef = useRef<ScanSide>("front");

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
    setCreateScanFront(null);
    setCreateScanBack(null);
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

  async function uploadScansForDocument(documentId: number, front: File, back: File | null) {
    if (!token) return;
    setScanBusyId(documentId);
    setError(null);
    try {
      const frontPdf = await imageFileToPdfBlob(front);
      await documentsApi.uploadScanSide(token, documentId, "front", frontPdf);
      if (back) {
        const backPdf = await imageFileToPdfBlob(back);
        await documentsApi.uploadScanSide(token, documentId, "back", backPdf);
      }
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("documents.scanUploadError"));
    } finally {
      setScanBusyId(null);
    }
  }

  function openScanWizard(target: ScanWizardTarget) {
    setScanWizard({ target, step: "front", frontFile: null, backFile: null });
  }

  function openOcrRegister() {
    openScanWizard({ kind: "create", withOcr: true });
  }

  function applyOcrResult(parsed: ReturnType<typeof parseDocumentOcrText>) {
    if (parsed.typeLabel) setTypeLabel(parsed.typeLabel);
    if (parsed.fields.length > 0) {
      setFieldDrafts(
        parsed.fields.map((f) => ({
          key: crypto.randomUUID(),
          label: f.label,
          value: f.value,
          isSecret: f.isSecret,
        })),
      );
    }
    if (parsed.expiryDate) {
      setHasExpiry(true);
      setExpiryDate(parsed.expiryDate);
    }
  }

  async function runOcrAndOpenCreate(front: File, back: File | null) {
    setOcrBusy(true);
    setOcrProgress(0);
    setError(null);
    try {
      const files = back ? [front, back] : [front];
      const text = await runOcrOnFiles(files, setOcrProgress);
      const parsed = parseDocumentOcrText(text);
      applyOcrResult(parsed);
      setCreateScanFront(front);
      setCreateScanBack(back);
      closeScanWizard();
      setShowCreate(true);
      if (parsed.fields.length === 0 && !parsed.typeLabel) {
        setError(t("documents.ocrLowConfidence"));
      }
    } catch {
      setError(t("documents.ocrError"));
    } finally {
      setOcrBusy(false);
      setOcrProgress(0);
    }
  }

  function closeScanWizard() {
    setScanWizard(null);
  }

  function startScanCapture(side: ScanSide) {
    scanCaptureSideRef.current = side;
    scanInputRef.current?.click();
  }

  async function handleScanInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !scanWizard) return;
    const side = scanCaptureSideRef.current;

    if (side === "front") {
      setScanWizard((w) => (w ? { ...w, frontFile: file, step: "back" } : w));
      return;
    }
    setScanWizard((w) => (w ? { ...w, backFile: file, step: "review" } : w));
  }

  async function confirmScanWizard() {
    if (!scanWizard?.frontFile) return;
    if (scanWizard.target.kind === "document") {
      await uploadScansForDocument(scanWizard.target.docId, scanWizard.frontFile, scanWizard.backFile);
      closeScanWizard();
      return;
    }
    if (scanWizard.target.withOcr) {
      await runOcrAndOpenCreate(scanWizard.frontFile, scanWizard.backFile);
      return;
    }
    setCreateScanFront(scanWizard.frontFile);
    setCreateScanBack(scanWizard.backFile);
    closeScanWizard();
  }

  async function sharePdfFiles(files: File[], title: string) {
    if (navigator.share && navigator.canShare?.({ files })) {
      await navigator.share({ files, title });
      return;
    }
    const blob = files[0]!;
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function exportCombinedPdf(doc: PublicDocument) {
    if (!token) return;
    setScanBusyId(doc.id);
    setError(null);
    try {
      const front = await documentsApi.downloadScanSide(token, doc.id, "front");
      let blob: Blob;
      if (doc.hasScanBack) {
        const back = await documentsApi.downloadScanSide(token, doc.id, "back");
        blob = await mergePdfBlobs([front, back]);
      } else {
        blob = front;
      }
      const file = new File([blob], `${doc.typeLabel}.pdf`, { type: "application/pdf" });
      await sharePdfFiles([file], doc.typeLabel);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("documents.scanOpenError"));
    } finally {
      setScanBusyId(null);
      setExportDoc(null);
    }
  }

  async function exportSeparatePdfs(doc: PublicDocument) {
    if (!token) return;
    setScanBusyId(doc.id);
    setError(null);
    try {
      const front = await documentsApi.downloadScanSide(token, doc.id, "front");
      const files = [new File([front], `${doc.typeLabel}_앞.pdf`, { type: "application/pdf" })];
      if (doc.hasScanBack) {
        const back = await documentsApi.downloadScanSide(token, doc.id, "back");
        files.push(new File([back], `${doc.typeLabel}_뒤.pdf`, { type: "application/pdf" }));
      }
      await sharePdfFiles(files, doc.typeLabel);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("documents.scanOpenError"));
    } finally {
      setScanBusyId(null);
      setExportDoc(null);
    }
  }

  function openExportOptions(doc: PublicDocument) {
    if (doc.hasScanBack) {
      setExportDoc(doc);
    } else {
      void exportCombinedPdf(doc);
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
      const created = await documentsApi.create(token, payload);
      if (createScanFront) {
        await uploadScansForDocument(created.id, createScanFront, createScanBack);
      }
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
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-indigo-600"
            aria-label={t("documents.manualEntry")}
          >
            {t("documents.manualEntry")}
          </button>
        }
      />

      <div className="mx-auto max-w-md px-4 pt-4 pb-8">
        <ScopeToggle value={scope} onChange={setScope} />

        <input
          ref={scanInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => void handleScanInputChange(e)}
        />

        <button
          type="button"
          onClick={openOcrRegister}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-4 text-sm font-bold text-white shadow-sm"
        >
          <Camera size={18} />
          {t("documents.ocrButton")}
        </button>
        <p className="mt-2 rounded-2xl bg-indigo-50/60 px-4 py-3 text-xs text-indigo-700">
          {t("documents.scanHint")}
        </p>

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
                      {d.hasScan && (
                        <p className="mt-0.5 text-[10px] font-medium text-indigo-500">
                          {d.hasScanBack ? t("documents.scanBothSaved") : t("documents.scanFrontSaved")}
                        </p>
                      )}
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

                  <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
                    {d.hasScan ? (
                      <>
                        <button
                          type="button"
                          onClick={() => openExportOptions(d)}
                          disabled={scanBusyId === d.id}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          <FileDown size={14} />
                          {t("documents.openPdf")}
                        </button>
                        <button
                          type="button"
                          onClick={() => openScanWizard({ kind: "document", docId: d.id })}
                          disabled={scanBusyId === d.id}
                          className="flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-2.5 text-xs font-semibold text-neutral-600"
                        >
                          <Camera size={14} />
                          {t("documents.rescan")}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openScanWizard({ kind: "document", docId: d.id })}
                        disabled={scanBusyId === d.id}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/40 py-2.5 text-xs font-semibold text-indigo-600 disabled:opacity-50"
                      >
                        <Camera size={14} />
                        {scanBusyId === d.id ? t("documents.scanUploading") : t("documents.captureScanBoth")}
                      </button>
                    )}
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
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">{t("documents.newDocument")}</h2>
              <button type="button" onClick={closeCreate} aria-label={t("documents.cancel")} className="rounded-full p-2">
                <X size={18} className="text-neutral-400" />
              </button>
            </div>
            <p className="mb-4 text-xs text-neutral-500">{t("documents.reviewOcrHint")}</p>

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

            <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50/80 p-3">
              <p className="text-sm font-semibold text-neutral-700">{t("documents.cardScan")}</p>
              <p className="mt-1 text-[11px] text-neutral-400">{t("documents.cardScanHint")}</p>
              <button
                type="button"
                onClick={() => openScanWizard({ kind: "create" })}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-indigo-300 bg-white py-2.5 text-xs font-semibold text-indigo-600"
              >
                <Camera size={14} />
                {createScanFront
                  ? createScanBack
                    ? t("documents.scanBothSelected")
                    : t("documents.scanFrontSelected")
                  : t("documents.captureScanBoth")}
              </button>
            </div>

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

      {scanWizard && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            {ocrBusy ? (
              <>
                <h2 className="text-base font-bold text-neutral-900">{t("documents.ocrProcessing")}</h2>
                <p className="mt-2 text-sm text-neutral-600">{t("documents.ocrProcessingHint")}</p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full bg-indigo-600 transition-all"
                    style={{ width: `${Math.round(ocrProgress * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-center text-xs text-neutral-400">
                  {Math.round(ocrProgress * 100)}%
                </p>
              </>
            ) : (
              <>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">
                {scanWizard.target.kind === "create" && scanWizard.target.withOcr
                  ? t("documents.ocrWizardTitle")
                  : t("documents.scanWizardTitle")}
              </h2>
              <button type="button" onClick={closeScanWizard} className="rounded-full p-2">
                <X size={18} className="text-neutral-400" />
              </button>
            </div>

            {scanWizard.step === "front" && (
              <>
                <p className="text-sm text-neutral-600">{t("documents.scanStepFront")}</p>
                <button
                  type="button"
                  onClick={() => startScanCapture("front")}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white"
                >
                  <Camera size={16} />
                  {t("documents.captureFront")}
                </button>
              </>
            )}

            {scanWizard.step === "back" && scanWizard.frontFile && (
              <>
                <p className="text-sm text-neutral-600">{t("documents.scanStepBack")}</p>
                <img
                  src={URL.createObjectURL(scanWizard.frontFile)}
                  alt=""
                  className="mt-3 max-h-28 w-full rounded-lg object-contain bg-neutral-100"
                />
                <button
                  type="button"
                  onClick={() => startScanCapture("back")}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white"
                >
                  <Camera size={16} />
                  {t("documents.captureBack")}
                </button>
                <button
                  type="button"
                  onClick={() => setScanWizard((w) => (w ? { ...w, step: "review", backFile: null } : w))}
                  className="mt-2 w-full py-2 text-xs font-semibold text-neutral-500"
                >
                  {t("documents.skipBack")}
                </button>
              </>
            )}

            {scanWizard.step === "review" && scanWizard.frontFile && (
              <>
                <p className="text-sm text-neutral-600">{t("documents.scanStepReview")}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div>
                    <p className="mb-1 text-[10px] font-semibold text-neutral-400">{t("documents.scanFrontLabel")}</p>
                    <img
                      src={URL.createObjectURL(scanWizard.frontFile)}
                      alt=""
                      className="h-24 w-full rounded-lg object-contain bg-neutral-100"
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-semibold text-neutral-400">{t("documents.scanBackLabel")}</p>
                    {scanWizard.backFile ? (
                      <img
                        src={URL.createObjectURL(scanWizard.backFile)}
                        alt=""
                        className="h-24 w-full rounded-lg object-contain bg-neutral-100"
                      />
                    ) : (
                      <div className="flex h-24 items-center justify-center rounded-lg bg-neutral-100 text-[10px] text-neutral-400">
                        {t("documents.scanNoBack")}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void confirmScanWizard()}
                  className="mt-4 w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white"
                >
                  {scanWizard.target.kind === "create" && scanWizard.target.withOcr
                    ? t("documents.ocrAnalyze")
                    : t("documents.scanSave")}
                </button>
              </>
            )}
              </>
            )}
          </div>
        </div>
      )}

      {exportDoc && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">{t("documents.exportPdfTitle")}</h2>
              <button type="button" onClick={() => setExportDoc(null)} className="rounded-full p-2">
                <X size={18} className="text-neutral-400" />
              </button>
            </div>
            <p className="text-sm text-neutral-600">{t("documents.exportPdfHint")}</p>
            <button
              type="button"
              onClick={() => void exportCombinedPdf(exportDoc)}
              disabled={scanBusyId === exportDoc.id}
              className="mt-4 w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {t("documents.exportCombined")}
            </button>
            <button
              type="button"
              onClick={() => void exportSeparatePdfs(exportDoc)}
              disabled={scanBusyId === exportDoc.id}
              className="mt-2 w-full rounded-xl border border-neutral-200 py-3 text-sm font-semibold text-neutral-700 disabled:opacity-50"
            >
              {t("documents.exportSeparate")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
