import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, ListChecks, Plus, Share2, Trash2, X } from "lucide-react";
import TopBar from "../components/TopBar";
import ScopeToggle, { type ViewScope } from "../components/ScopeToggle";
import SharedBadge from "../components/SharedBadge";
import { useLanguage } from "../i18n/LanguageContext";
import { useAuth } from "../context/AuthContext";
import {
  checklistsApi,
  type PublicChecklist,
  type PublicChecklistDetail,
  type PublicChecklistItem,
} from "../api/checklists";
import { ApiError } from "../api/http";

type TreeNode = PublicChecklistItem & { children: TreeNode[] };

function buildTree(items: PublicChecklistItem[]): TreeNode[] {
  const map = new Map<number, TreeNode>();
  for (const item of items) {
    map.set(item.id, { ...item, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const node of map.values()) {
    if (node.parentId != null && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

export default function ChecklistsPage() {
  const { t } = useLanguage();
  const { token, user, family } = useAuth();
  const [scope, setScope] = useState<ViewScope>("all");
  const [lists, setLists] = useState<PublicChecklist[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [detail, setDetail] = useState<PublicChecklistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newShared, setNewShared] = useState(false);
  const [itemDraft, setItemDraft] = useState("");
  const [parentForAdd, setParentForAdd] = useState<PublicChecklistItem | null>(null);
  const [busy, setBusy] = useState(false);

  const loadLists = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await checklistsApi.list(token, scope);
      setLists(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("checklists.errorLoad"));
      setLists([]);
    } finally {
      setLoading(false);
    }
  }, [token, scope, t]);

  const loadDetail = useCallback(
    async (id: number) => {
      if (!token) return;
      setError(null);
      try {
        const data = await checklistsApi.get(token, id);
        setDetail(data);
        setActiveId(id);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t("checklists.errorLoad"));
      }
    },
    [token, t],
  );

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  const tree = useMemo(() => (detail ? buildTree(detail.items) : []), [detail]);

  async function handleCreateList(e: FormEvent) {
    e.preventDefault();
    if (!token || !newTitle.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await checklistsApi.create(token, {
        title: newTitle.trim(),
        isShared: newShared,
      });
      setShowCreate(false);
      setNewTitle("");
      setNewShared(false);
      await loadLists();
      await loadDetail(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("checklists.errorSave"));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddItem(e: FormEvent) {
    e.preventDefault();
    if (!token || !activeId || !itemDraft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await checklistsApi.addItem(token, activeId, {
        title: itemDraft.trim(),
        parentId: parentForAdd?.id ?? null,
      });
      setItemDraft("");
      setParentForAdd(null);
      await loadDetail(activeId);
      await loadLists();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("checklists.errorSave"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteItem(item: PublicChecklistItem) {
    if (!token || !activeId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await checklistsApi.removeItem(token, activeId, item.id);
      if (parentForAdd?.id === item.id) setParentForAdd(null);
      await loadDetail(activeId);
      await loadLists();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("checklists.errorSave"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteList() {
    if (!token || !activeId || busy) return;
    if (!window.confirm(t("checklists.confirmDeleteList"))) return;
    setBusy(true);
    try {
      await checklistsApi.remove(token, activeId);
      setActiveId(null);
      setDetail(null);
      await loadLists();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("checklists.errorSave"));
    } finally {
      setBusy(false);
    }
  }

  function renderNode(node: TreeNode, depth: number) {
    return (
      <li key={node.id}>
        <div
          className="group flex items-stretch gap-1"
          style={{ paddingLeft: `${depth * 16}px` }}
        >
          <button
            type="button"
            onClick={() => void handleDeleteItem(node)}
            disabled={busy}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-3 text-left transition active:bg-rose-50"
            aria-label={t("checklists.tapToRemove")}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-neutral-300 bg-white text-transparent group-active:border-rose-400 group-active:bg-rose-50">
              ✓
            </span>
            <span className="min-w-0 flex-1 text-sm font-medium text-neutral-800">{node.title}</span>
          </button>
          <button
            type="button"
            onClick={() => setParentForAdd(node)}
            disabled={busy}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-indigo-500 active:bg-indigo-50"
            aria-label={t("checklists.addChild")}
            title={t("checklists.addChild")}
          >
            <Plus size={18} />
          </button>
        </div>
        {node.children.length > 0 && (
          <ul className="mt-0.5">{node.children.map((c) => renderNode(c, depth + 1))}</ul>
        )}
      </li>
    );
  }

  if (activeId && detail) {
    return (
      <div>
        <TopBar
          title={detail.title}
          subtitle={t("checklists.detailSubtitle")}
          right={
            <div className="flex items-center gap-1">
              {detail.userId === user?.id && (
                <button
                  type="button"
                  onClick={() => void handleDeleteList()}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-rose-500 active:bg-rose-50"
                  aria-label={t("checklists.deleteList")}
                >
                  <Trash2 size={18} />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setActiveId(null);
                  setDetail(null);
                  setParentForAdd(null);
                  setItemDraft("");
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-600"
                aria-label={t("checklists.back")}
              >
                <ArrowLeft size={18} />
              </button>
            </div>
          }
        />

        <div className="mx-auto max-w-md px-4 pt-3 pb-28">
          <div className="mb-3 flex items-center justify-between px-1">
            <p className="text-xs text-neutral-400">
              {detail.ownerName} · {t("checklists.itemCount", { n: detail.itemCount })}
            </p>
            <SharedBadge isShared={detail.isShared} />
          </div>

          {error && (
            <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</p>
          )}

          <p className="mb-2 px-1 text-[11px] text-neutral-400">{t("checklists.tapHint")}</p>

          {tree.length === 0 ? (
            <div className="rounded-2xl bg-white px-4 py-10 text-center shadow-sm ring-1 ring-black/5">
              <ListChecks className="mx-auto text-neutral-300" size={28} />
              <p className="mt-2 text-sm text-neutral-500">{t("checklists.emptyItems")}</p>
            </div>
          ) : (
            <ul className="rounded-2xl bg-white py-1 shadow-sm ring-1 ring-black/5">
              {tree.map((n) => renderNode(n, 0))}
            </ul>
          )}

          <form
            onSubmit={(e) => void handleAddItem(e)}
            className="fixed inset-x-0 bottom-16 z-10 border-t border-black/5 bg-white/95 px-4 py-3 backdrop-blur safe-bottom"
          >
            <div className="mx-auto max-w-md">
              {parentForAdd && (
                <div className="mb-2 flex items-center justify-between rounded-lg bg-indigo-50 px-3 py-1.5 text-xs text-indigo-700">
                  <span>
                    {t("checklists.addingUnder", { title: parentForAdd.title })}
                  </span>
                  <button type="button" onClick={() => setParentForAdd(null)} aria-label={t("checklists.clearParent")}>
                    <X size={14} />
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={itemDraft}
                  onChange={(e) => setItemDraft(e.target.value)}
                  placeholder={
                    parentForAdd ? t("checklists.placeholderChild") : t("checklists.placeholderItem")
                  }
                  className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={busy || !itemDraft.trim()}
                  className="rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {t("checklists.add")}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div>
      <TopBar
        title={t("checklists.title")}
        subtitle={t("checklists.subtitle")}
        right={
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white"
            aria-label={t("checklists.newList")}
          >
            <Plus size={18} />
          </button>
        }
      />

      <div className="mx-auto max-w-md px-4 pt-4 pb-24">
        <ScopeToggle value={scope} onChange={setScope} />

        {error && (
          <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</p>
        )}

        {loading ? (
          <p className="mt-8 text-center text-sm text-neutral-400">{t("checklists.loading")}</p>
        ) : lists.length === 0 ? (
          <div className="mt-8 rounded-2xl bg-white px-4 py-12 text-center shadow-sm ring-1 ring-black/5">
            <ListChecks className="mx-auto text-neutral-300" size={32} />
            <p className="mt-3 text-sm font-medium text-neutral-600">{t("checklists.empty")}</p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="mt-4 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
            >
              {t("checklists.newList")}
            </button>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {lists.map((list) => (
              <li key={list.id}>
                <button
                  type="button"
                  onClick={() => void loadDetail(list.id)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-black/5 active:bg-neutral-50"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-50">
                    <ListChecks size={18} className="text-teal-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-neutral-900">{list.title}</p>
                    <p className="mt-0.5 text-[11px] text-neutral-400">
                      {list.ownerName} · {t("checklists.itemCount", { n: list.itemCount })}
                    </p>
                  </div>
                  <SharedBadge isShared={list.isShared} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center">
          <form
            onSubmit={(e) => void handleCreateList(e)}
            className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">{t("checklists.newList")}</h2>
              <button type="button" onClick={() => setShowCreate(false)} aria-label={t("checklists.cancel")}>
                <X size={20} className="text-neutral-400" />
              </button>
            </div>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={t("checklists.placeholderTitle")}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
              autoFocus
            />
            {family && (
              <label className="mt-3 flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={newShared}
                  onChange={(e) => setNewShared(e.target.checked)}
                  className="rounded border-neutral-300"
                />
                <Share2 size={14} className="text-indigo-500" />
                {t("checklists.shareWithFamily")}
              </label>
            )}
            <button
              type="submit"
              disabled={busy || !newTitle.trim()}
              className="mt-4 w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {t("checklists.create")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
