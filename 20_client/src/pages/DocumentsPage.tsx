import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Camera, ChevronDown, Copy, Eye, EyeOff, FileDown, Maximize2, Plus, Star, Trash2, X } from "lucide-react";
import TopBar from "../components/TopBar";
import ScopeToggle, { type ViewScope } from "../components/ScopeToggle";
import SharedBadge from "../components/SharedBadge";
import OverlayScrim from "../components/OverlayScrim";
import SwipeableRow from "../components/SwipeableRow";
import ItemDetailSheet, { DetailRow } from "../components/ItemDetailSheet";
import DocumentShowMode from "../components/DocumentShowMode";
import { useLanguage } from "../i18n/LanguageContext";
import {
  documentTypeSuggestions,
  localizeDocumentFieldLabel,
  localizeDocumentTypeLabel,
} from "../i18n/translations";
import { useAuth } from "../context/AuthContext";
import {
  DOCUMENT_CATEGORY_ORDER,
  documentsApi,
  type CreateDocumentInput,
  type DocumentCategory,
  type DocumentFieldInput,
  type PublicDocument,
  type ScanSide,
} from "../api/documents";
import { ApiError } from "../api/http";
import { isPasskeySupported } from "../api/passkey";
import { imageFileToPdfBlob } from "../utils/imageToPdf";
import { mergePdfBlobs } from "../utils/pdfMerge";
import { runOcrOnFiles } from "../utils/documentOcr";
import { parseDocumentOcrText } from "@personal-app/document-ocr-parse";
import { readPinnedDocumentIds, togglePinnedDocumentId } from "../utils/documentPins";

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
  const { t, lang } = useLanguage();
  const { token, family, user } = useAuth();
  const [scope, setScope] = useState<ViewScope>("all");
  const [items, setItems] = useState<PublicDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<PublicDocument | null>(null);
  const [swipeId, setSwipeId] = useState<number | null>(null);
  const [detailDoc, setDetailDoc] = useState<PublicDocument | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PublicDocument | null>(null);

  const [typeLabel, setTypeLabel] = useState("");
  const [category, setCategory] = useState<DocumentCategory>("other");
  const [categoryFilter, setCategoryFilter] = useState<DocumentCategory | "all">("all");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<DocumentCategory>>(new Set());
  const [fieldDrafts, setFieldDrafts] = useState<FieldDraft[]>([emptyField()]);
  const [memo, setMemo] = useState("");
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
  const [fromOcrReview, setFromOcrReview] = useState(false);
  const [showModeDoc, setShowModeDoc] = useState<PublicDocument | null>(null);
  const [pinnedIds, setPinnedIds] = useState<number[]>(() => readPinnedDocumentIds());
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
    const sorted = [...items].sort((a, b) => daysLeft(a.expiryDate) - daysLeft(b.expiryDate));
    return sorted.sort((a, b) => {
      const aPinned = pinnedIds.includes(a.id) ? 0 : 1;
      const bPinned = pinnedIds.includes(b.id) ? 0 : 1;
      if (aPinned !== bPinned) return aPinned - bPinned;
      return daysLeft(a.expiryDate) - daysLeft(b.expiryDate);
    });
  }, [items, daysLeft, pinnedIds]);

  const pinnedQuickAccess = useMemo(
    () => visible.filter((d) => pinnedIds.includes(d.id) && d.hasScan),
    [visible, pinnedIds],
  );

  const filteredByCategory = useMemo(() => {
    if (categoryFilter === "all") return visible;
    return visible.filter((d) => d.category === categoryFilter);
  }, [visible, categoryFilter]);

  const groupedDocuments = useMemo(() => {
    const buckets = new Map<DocumentCategory, PublicDocument[]>();
    for (const cat of DOCUMENT_CATEGORY_ORDER) buckets.set(cat, []);
    for (const doc of filteredByCategory) {
      const list = buckets.get(doc.category) ?? buckets.get("other")!;
      list.push(doc);
    }
    const sortDocs = (docs: PublicDocument[]) =>
      [...docs].sort((a, b) => {
        const aPinned = pinnedIds.includes(a.id) ? 0 : 1;
        const bPinned = pinnedIds.includes(b.id) ? 0 : 1;
        if (aPinned !== bPinned) return aPinned - bPinned;
        return daysLeft(a.expiryDate) - daysLeft(b.expiryDate);
      });
    return DOCUMENT_CATEGORY_ORDER.map((cat) => ({
      category: cat,
      items: sortDocs(buckets.get(cat) ?? []),
    })).filter((group) => group.items.length > 0);
  }, [filteredByCategory, pinnedIds, daysLeft]);

  function toggleCategoryCollapse(cat: DocumentCategory) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function togglePin(docId: number) {
    setPinnedIds(togglePinnedDocumentId(docId));
  }

  function openDetail(doc: PublicDocument) {
    setSwipeId(null);
    setDetailDoc(doc);
  }

  function openShowMode(doc: PublicDocument) {
    setSwipeId(null);
    setDetailDoc(null);
    setShowModeDoc(doc);
  }

  function closeShowMode() {
    setShowModeDoc(null);
  }

  function resetForm() {
    setTypeLabel("");
    setCategory("other");
    setFieldDrafts([emptyField()]);
    setMemo("");
    setExpiryDate(todayIsoDate());
    setHasExpiry(true);
    setIsShared(false);
    setCreateScanFront(null);
    setCreateScanBack(null);
    setFromOcrReview(false);
    setEditing(null);
  }

  function openCreate() {
    resetForm();
    setSwipeId(null);
    setDetailDoc(null);
    setShowCreate(true);
  }

  function openEdit(doc: PublicDocument) {
    setEditing(doc);
    setTypeLabel(doc.typeLabel);
    setCategory(doc.category);
    setMemo(doc.memo ?? "");
    setFieldDrafts(
      doc.fields.map((f) => ({
        key: crypto.randomUUID(),
        id: f.id,
        label: f.label,
        value: f.isSecret ? "" : (f.value ?? ""),
        isSecret: f.isSecret,
      })),
    );
    setHasExpiry(!!doc.expiryDate);
    setExpiryDate(doc.expiryDate ?? todayIsoDate());
    setIsShared(doc.isShared);
    setCreateScanFront(null);
    setCreateScanBack(null);
    setSwipeId(null);
    setDetailDoc(null);
    setShowCreate(true);
  }

  function closeCreate() {
    setShowCreate(false);
    setSubmitting(false);
    setFromOcrReview(false);
    setEditing(null);
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
    if (parsed.category) setCategory(parsed.category);
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

  function buildPayloadFromParsed(parsed: ReturnType<typeof parseDocumentOcrText>): CreateDocumentInput | null {
    const label = parsed.typeLabel?.trim() ?? "";
    const fields: DocumentFieldInput[] = parsed.fields
      .filter((f) => f.label.trim())
      .map((f) => ({
        label: f.label.trim(),
        value: f.value,
        isSecret: f.isSecret,
      }));
    const hasFieldValue = fields.some((f) => f.value?.trim());
    if (!label || fields.length === 0 || !hasFieldValue) return null;
    return {
      typeLabel: label,
      category: parsed.category ?? category,
      fields,
      expiryDate: parsed.expiryDate ?? null,
      isShared: false,
      memo: null,
    };
  }

  async function runOcrOnScanFiles(front: File, back: File | null) {
    const files = back ? [front, back] : [front];
    const text = await runOcrOnFiles(files, setOcrProgress);
    return parseDocumentOcrText(text);
  }

  function openOcrReviewForm(front: File, back: File | null, parsed: ReturnType<typeof parseDocumentOcrText>) {
    applyOcrResult(parsed);
    setCreateScanFront(front);
    setCreateScanBack(back);
    setFromOcrReview(true);
    closeScanWizard();
    setShowCreate(true);
  }

  async function runOcrAndSave(front: File, back: File | null) {
    if (!token) return;
    setOcrBusy(true);
    setOcrProgress(0);
    setError(null);
    try {
      const parsed = await runOcrOnScanFiles(front, back);
      const payload = buildPayloadFromParsed(parsed);
      if (payload) {
        const created = await documentsApi.create(token, payload);
        await uploadScansForDocument(created.id, front, back);
        closeScanWizard();
        resetForm();
        await load();
        return;
      }
      openOcrReviewForm(front, back, parsed);
      setError(t("documents.ocrLowConfidence"));
    } catch {
      setError(t("documents.ocrError"));
      openOcrReviewForm(front, back, { typeLabel: null, category: null, fields: [], expiryDate: null });
    } finally {
      setOcrBusy(false);
      setOcrProgress(0);
    }
  }

  async function runOcrAndOpenCreate(front: File, back: File | null) {
    setOcrBusy(true);
    setOcrProgress(0);
    setError(null);
    try {
      const parsed = await runOcrOnScanFiles(front, back);
      openOcrReviewForm(front, back, parsed);
      if (parsed.fields.length === 0 && !parsed.typeLabel) {
        setError(t("documents.ocrLowConfidence"));
      }
    } catch {
      setError(t("documents.ocrError"));
      openOcrReviewForm(front, back, { typeLabel: null, category: null, fields: [], expiryDate: null });
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
      await runOcrAndSave(scanWizard.frontFile, scanWizard.backFile);
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || submitting) return;
    if (!typeLabel.trim()) {
      setError(t("documents.typeLabelRequired"));
      return;
    }
    const fields: DocumentFieldInput[] = fieldDrafts
      .filter((f) => f.label.trim())
      .map((f) => {
        const base: DocumentFieldInput = {
          id: f.id,
          label: f.label.trim(),
          isSecret: f.isSecret,
        };
        if (editing && f.isSecret && !f.value.trim()) {
          return base;
        }
        return { ...base, value: f.value };
      });
    if (fields.length === 0) {
      setError(t("documents.fieldsRequired"));
      return;
    }
    const hasFieldValue = fields.some((f, idx) => {
      const draft = fieldDrafts.filter((d) => d.label.trim())[idx];
      if (f.value?.trim()) return true;
      if (editing && draft?.isSecret) {
        return editing.fields.some((ef) => ef.id === f.id && ef.hasValue);
      }
      return false;
    });
    if (!hasFieldValue) {
      setError(t("documents.fieldValueRequired"));
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      const payload: CreateDocumentInput = {
        typeLabel: typeLabel.trim(),
        category,
        fields,
        expiryDate: hasExpiry ? expiryDate : null,
        isShared,
        memo: memo.trim() || null,
      };
      if (editing) {
        await documentsApi.update(token, editing.id, payload);
      } else {
        const created = await documentsApi.create(token, payload);
        if (createScanFront) {
          await uploadScansForDocument(created.id, createScanFront, createScanBack);
        }
      }
      closeCreate();
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("documents.errorSave"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!token || !confirmDelete) return;
    setSubmitting(true);
    setError(null);
    try {
      await documentsApi.remove(token, confirmDelete.id);
      setConfirmDelete(null);
      setDetailDoc(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("documents.deleteError"));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    typeLabel.trim().length > 0 &&
    fieldDrafts.some((f) => {
      if (!f.label.trim()) return false;
      if (f.value.trim()) return true;
      if (editing && f.isSecret) {
        return editing.fields.some((ef) => ef.id === f.id && ef.hasValue);
      }
      return false;
    });

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

        {pinnedQuickAccess.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold text-neutral-500">{t("documents.pinnedQuickAccess")}</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {pinnedQuickAccess.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => openShowMode(d)}
                  className="flex min-w-[132px] shrink-0 flex-col rounded-2xl bg-white px-3 py-3 text-left shadow-sm ring-1 ring-indigo-100"
                >
                  <Star size={14} className="fill-amber-400 text-amber-400" />
                  <p className="mt-1 line-clamp-2 text-sm font-bold text-neutral-900">
                    {localizeDocumentTypeLabel(d.typeLabel, t)}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold text-indigo-600">{t("documents.showAtHospital")}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {(["all", ...DOCUMENT_CATEGORY_ORDER] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                categoryFilter === cat
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-neutral-600 ring-1 ring-black/5"
              }`}
            >
              {cat === "all" ? t("documents.category.all") : t(`documents.category.${cat}`)}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</p>}
          {loading ? (
            <p className="py-10 text-center text-sm text-neutral-400">{t("documents.loading")}</p>
          ) : filteredByCategory.length === 0 ? (
            <div className="rounded-2xl bg-white px-4 py-12 text-center shadow-sm ring-1 ring-black/5">
              <p className="text-sm font-medium text-neutral-600">{t("documents.empty")}</p>
            </div>
          ) : (
            <>
              {groupedDocuments.map((group) => {
              const collapsed = collapsedCategories.has(group.category);
              return (
                <section key={group.category}>
                  <button
                    type="button"
                    onClick={() => toggleCategoryCollapse(group.category)}
                    className="flex w-full items-center justify-between rounded-xl bg-neutral-100/80 px-3 py-2.5 text-left"
                  >
                    <span className="text-sm font-bold text-neutral-800">
                      {t(`documents.category.${group.category}`)}
                      <span className="ml-1.5 text-xs font-semibold text-neutral-400">({group.items.length})</span>
                    </span>
                    <ChevronDown
                      size={18}
                      className={`text-neutral-400 transition-transform ${collapsed ? "" : "rotate-180"}`}
                    />
                  </button>
                  {!collapsed && (
                    <div className="mt-2 flex flex-col gap-3">
                      {group.items.map((d) => {
                        const dLeft = daysLeft(d.expiryDate);
                        const urgent = d.expiryDate !== null && dLeft <= 30;
                        const canManage = user?.id === d.userId;
                        return (
                          <SwipeableRow
                            key={d.id}
                            canDelete={canManage}
                            deleteLabel={t("documents.deleteDocument")}
                            actionOpen={swipeId === d.id}
                            onActionOpenChange={(open) => setSwipeId(open ? d.id : null)}
                            onPress={() => openDetail(d)}
                            onLongPress={() => openDetail(d)}
                            onDelete={() => {
                              setSwipeId(null);
                              setConfirmDelete(d);
                            }}
                          >
                            <div className="p-4">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="text-[11px] font-semibold text-neutral-400">{d.ownerName}</p>
                                  <p className="mt-0.5 text-sm font-bold text-neutral-900">
                                    {localizeDocumentTypeLabel(d.typeLabel, t)}
                                  </p>
                                  {d.memo && (
                                    <p className="mt-1 line-clamp-1 text-xs text-neutral-500">{d.memo}</p>
                                  )}
                                  {d.hasScan && (
                                    <p className="mt-0.5 text-[10px] font-medium text-indigo-500">
                                      {d.hasScanBack ? t("documents.scanBothSaved") : t("documents.scanFrontSaved")}
                                    </p>
                                  )}
                                  {d.hasSecrets && (
                                    <p className="mt-0.5 text-[10px] font-medium text-amber-600">
                                      {t("documents.hasSecrets")}
                                    </p>
                                  )}
                                  {d.fields.length > 0 && (
                                    <p className="mt-0.5 text-[10px] text-neutral-400">
                                      {t("documents.fieldCount", { n: d.fields.length })}
                                    </p>
                                  )}
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  {d.expiryDate && (
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                        urgent ? "bg-rose-50 text-rose-500" : "bg-neutral-100 text-neutral-500"
                                      }`}
                                    >
                                      D-{dLeft}
                                    </span>
                                  )}
                                  <SharedBadge isShared={d.isShared} />
                                  {d.hasScan && (
                                    <button
                                      type="button"
                                      data-swipe-ignore
                                      onClick={() => togglePin(d.id)}
                                      className="rounded-full p-2 text-neutral-400 hover:bg-neutral-50"
                                      aria-label={pinnedIds.includes(d.id) ? t("documents.unpin") : t("documents.pin")}
                                    >
                                      <Star
                                        size={18}
                                        className={pinnedIds.includes(d.id) ? "fill-amber-400 text-amber-400" : ""}
                                      />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </SwipeableRow>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
              <p className="text-center text-[11px] text-neutral-400">{t("common.rowHint")}</p>
            </>
          )}
        </div>
      </div>

      {detailDoc && (() => {
        const d = detailDoc;
        const canManage = user?.id === d.userId;
        const docRevealed = Boolean(revealedByDoc[d.id]);
        const dLeft = daysLeft(d.expiryDate);
        const urgent = d.expiryDate !== null && dLeft <= 30;
        return (
          <ItemDetailSheet
            title={localizeDocumentTypeLabel(d.typeLabel, t)}
            onClose={() => setDetailDoc(null)}
            closeLabel={t("documents.cancel")}
            editLabel={t("documents.editDocument")}
            deleteLabel={t("documents.deleteDocument")}
            canManage={canManage}
            onEdit={() => openEdit(d)}
            onDelete={() => {
              setConfirmDelete(d);
              setDetailDoc(null);
            }}
          >
            <DetailRow label={t("documents.fieldCategory")}>
              {t(`documents.category.${d.category}`)}
            </DetailRow>
            {d.memo ? (
              <DetailRow label={t("documents.fieldMemo")}>{d.memo}</DetailRow>
            ) : null}
            {d.expiryDate ? (
              <DetailRow label={t("documents.hasExpiry")}>
                <span className="inline-flex items-center gap-2">
                  {t("documents.expiryLabel", { date: d.expiryDate })}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      urgent ? "bg-rose-50 text-rose-500" : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    D-{dLeft}
                  </span>
                </span>
              </DetailRow>
            ) : null}
            <DetailRow label={t("documents.shareWithFamily")}>
              {d.isShared ? t("scope.family") : t("scope.personal")}
              {` · ${d.ownerName}`}
            </DetailRow>

            {d.fields.length > 0 && (
              <div className="mt-4 border-t border-neutral-100 pt-2">
                <div className="flex items-center justify-between gap-2 py-2">
                  <p className="text-xs font-semibold text-neutral-500">{t("documents.fieldItems")}</p>
                  {d.hasSecrets && (
                    <button
                      type="button"
                      onClick={() => void handleReveal(d)}
                      disabled={revealBusyId === d.id}
                      className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
                    >
                      {revealBusyId === d.id ? (
                        <span className="block h-3.5 w-3.5 animate-pulse rounded-full bg-neutral-200" />
                      ) : docRevealed ? (
                        <EyeOff size={14} />
                      ) : (
                        <Eye size={14} />
                      )}
                      {docRevealed ? t("documents.hideSecrets") : t("documents.revealSecrets")}
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {d.fields.map((field) => {
                    const display = displayFieldValue(d.id, field);
                    const copyKey = `${d.id}-${field.id}`;
                    const showCopy =
                      field.isSecret
                        ? isFieldRevealed(d.id, field.id) && display !== "—"
                        : display !== "—";
                    return (
                      <div key={field.id} className="flex items-start justify-between gap-2 rounded-xl bg-neutral-50 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium text-neutral-400">
                            {localizeDocumentFieldLabel(field.label, t)}
                          </p>
                          <p className="mt-0.5 break-all font-mono text-xs text-neutral-600">{display}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          {showCopy && (
                            <button
                              type="button"
                              onClick={() => void handleCopy(display, copyKey)}
                              className="rounded-full p-1.5 text-neutral-400 hover:bg-white"
                              aria-label={t("documents.copy")}
                            >
                              <Copy size={14} />
                            </button>
                          )}
                          {copiedKey === copyKey && (
                            <span className="text-[10px] text-indigo-500">{t("documents.copied")}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {d.hasScan && (
              <button
                type="button"
                onClick={() => togglePin(d.id)}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-700"
              >
                <Star
                  size={14}
                  className={pinnedIds.includes(d.id) ? "fill-amber-400 text-amber-400" : ""}
                />
                {pinnedIds.includes(d.id) ? t("documents.unpin") : t("documents.pin")}
              </button>
            )}
            {d.hasScan && (
              <button
                type="button"
                onClick={() => openShowMode(d)}
                disabled={scanBusyId === d.id}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Maximize2 size={14} />
                {d.category === "medical" ? t("documents.showAtHospital") : t("documents.showCard")}
              </button>
            )}
            {d.hasScan && (
              <button
                type="button"
                onClick={() => openExportOptions(d)}
                disabled={scanBusyId === d.id}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-neutral-100 py-2.5 text-sm font-semibold text-neutral-700 disabled:opacity-50"
              >
                <FileDown size={14} /> {t("documents.openPdf")}
              </button>
            )}
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setDetailDoc(null);
                  openScanWizard({ kind: "document", docId: d.id });
                }}
                disabled={scanBusyId === d.id}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-700 disabled:opacity-50"
              >
                <Camera size={14} />
                {d.hasScan
                  ? t("documents.rescan")
                  : scanBusyId === d.id
                    ? t("documents.scanUploading")
                    : t("documents.captureScanBoth")}
              </button>
            )}
          </ItemDetailSheet>
        );
      })()}

      {showCreate && (
        <OverlayScrim
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center"
          onDismiss={closeCreate}
          label={t("documents.cancel")}
        >
          <form
            onSubmit={handleSubmit}
            className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">
                {editing ? t("documents.editDocument") : t("documents.newDocument")}
              </h2>
              <button type="button" onClick={closeCreate} aria-label={t("documents.cancel")} className="rounded-full p-2">
                <X size={18} className="text-neutral-400" />
              </button>
            </div>
            {!editing && fromOcrReview && (
              <p className="mb-4 text-xs text-neutral-500">{t("documents.reviewOcrHint")}</p>
            )}

            <label className="mb-2 block text-sm font-semibold text-neutral-700">{t("documents.fieldCategory")}</label>
            <div className="mb-4 flex flex-wrap gap-2">
              {DOCUMENT_CATEGORY_ORDER.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    category === cat
                      ? "bg-indigo-600 text-white"
                      : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {t(`documents.category.${cat}`)}
                </button>
              ))}
            </div>

            <label className="mb-2 block text-sm font-semibold text-neutral-700">{t("documents.fieldName")}</label>
            <input
              list="document-type-suggestions"
              value={typeLabel}
              onChange={(e) => setTypeLabel(e.target.value)}
              placeholder={t("documents.placeholderName")}
              className="mb-4 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
            />
            <datalist id="document-type-suggestions">
              {documentTypeSuggestions[lang].map((s) => (
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
                    placeholder={
                      editing && field.isSecret
                        ? t("documents.secretKeepHint")
                        : t("documents.placeholderFieldValue")
                    }
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

            <label className="mt-4 block text-sm font-semibold text-neutral-700">{t("documents.fieldMemo")}</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder={t("documents.placeholderMemo")}
              rows={3}
              className="mt-2 w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
            />

            {!editing && (
              <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50/80 p-3">
                <p className="text-sm font-semibold text-neutral-700">{t("documents.cardScan")}</p>
                {createScanFront ? (
                  <>
                    <p className="mt-1 text-[11px] text-emerald-600">{t("documents.scanAttachedHint")}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div>
                        <p className="mb-1 text-[10px] font-semibold text-neutral-400">{t("documents.scanFrontLabel")}</p>
                        <img
                          src={URL.createObjectURL(createScanFront)}
                          alt=""
                          className="h-20 w-full rounded-lg bg-neutral-100 object-contain"
                        />
                      </div>
                      <div>
                        <p className="mb-1 text-[10px] font-semibold text-neutral-400">{t("documents.scanBackLabel")}</p>
                        {createScanBack ? (
                          <img
                            src={URL.createObjectURL(createScanBack)}
                            alt=""
                            className="h-20 w-full rounded-lg bg-neutral-100 object-contain"
                          />
                        ) : (
                          <div className="flex h-20 items-center justify-center rounded-lg bg-neutral-100 text-[10px] text-neutral-400">
                            {t("documents.scanNoBack")}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openScanWizard({ kind: "create" })}
                      className="mt-2 w-full rounded-lg border border-neutral-200 bg-white py-2 text-xs font-semibold text-neutral-600"
                    >
                      {t("documents.rescan")}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-[11px] text-neutral-400">{t("documents.cardScanHint")}</p>
                    <button
                      type="button"
                      onClick={() => openScanWizard({ kind: "create" })}
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-indigo-300 bg-white py-2.5 text-xs font-semibold text-indigo-600"
                    >
                      <Camera size={14} />
                      {t("documents.captureScanBoth")}
                    </button>
                  </>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !canSubmit}
              className="mt-4 w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {t("documents.save")}
            </button>
          </form>
        </OverlayScrim>
      )}

      {scanWizard && (
        <OverlayScrim
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center"
          onDismiss={ocrBusy ? undefined : closeScanWizard}
          label={t("documents.cancel")}
        >
          <div className="relative w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
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
                <p className="text-sm text-neutral-600">
                  {scanWizard.target.kind === "create" && scanWizard.target.withOcr
                    ? t("documents.ocrReviewStepHint")
                    : t("documents.scanStepReview")}
                </p>
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
                {scanWizard.target.kind === "create" && scanWizard.target.withOcr ? (
                  <div className="mt-4 space-y-2">
                    <button
                      type="button"
                      disabled={ocrBusy}
                      onClick={() => void confirmScanWizard()}
                      className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      {t("documents.ocrAnalyze")}
                    </button>
                    <button
                      type="button"
                      disabled={ocrBusy}
                      onClick={() =>
                        void runOcrAndOpenCreate(scanWizard.frontFile!, scanWizard.backFile)
                      }
                      className="w-full rounded-xl border border-neutral-200 py-3 text-sm font-semibold text-neutral-600 disabled:opacity-40"
                    >
                      {t("documents.ocrReviewEdit")}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void confirmScanWizard()}
                    className="mt-4 w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white"
                  >
                    {t("documents.scanSave")}
                  </button>
                )}
              </>
            )}
              </>
            )}
          </div>
        </OverlayScrim>
      )}

      {confirmDelete && (
        <OverlayScrim
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onDismiss={() => setConfirmDelete(null)}
          label={t("documents.cancel")}
          swipeToDismiss={false}
        >
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-bold text-neutral-900">{t("documents.deleteDocument")}</h2>
            <p className="mt-2 text-sm text-neutral-500">
              {t("documents.deleteConfirm", { name: confirmDelete.typeLabel })}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-600"
              >
                {t("documents.cancel")}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleDelete()}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {t("documents.deleteDocument")}
              </button>
            </div>
          </div>
        </OverlayScrim>
      )}

      {exportDoc && (
        <OverlayScrim
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center"
          onDismiss={() => setExportDoc(null)}
          label={t("documents.cancel")}
        >
          <div className="relative w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
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
        </OverlayScrim>
      )}

      {showModeDoc && token && (
        <DocumentShowMode
          doc={showModeDoc}
          token={token}
          revealedFields={revealedByDoc[showModeDoc.id] ?? null}
          t={t}
          onClose={closeShowMode}
        />
      )}
    </div>
  );
}
