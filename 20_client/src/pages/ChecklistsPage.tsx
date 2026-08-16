import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useKeepLastItemAboveComposer } from "../hooks/useKeepLastItemAboveComposer";
import { useKeepFocusedInScrollParent } from "../hooks/useKeepFocusedInScrollParent";
import { ArrowLeft, Check, ListChecks, Plus, Share2, X } from "lucide-react";
import TopBar from "../components/TopBar";
import ScopeToggle, { type ViewScope } from "../components/ScopeToggle";
import SharedBadge from "../components/SharedBadge";
import OverlayScrim from "../components/OverlayScrim";
import SwipeableRow from "../components/SwipeableRow";
import ItemDetailSheet, { DetailRow } from "../components/ItemDetailSheet";
import { useLanguage } from "../i18n/LanguageContext";
import { useAuth } from "../context/AuthContext";
import {
  checklistsApi,
  type PublicChecklist,
  type PublicChecklistDetail,
  type PublicChecklistItem,
} from "../api/checklists";
import { ApiError } from "../api/http";
import {
  completedRootIds,
  filterVisibleChecklistRoots,
} from "../utils/checklistVisibility";

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
    nodes.sort((a, b) => {
      const aDone = a.completedAt ? 1 : 0;
      const bDone = b.completedAt ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return a.sortOrder - b.sortOrder || a.id - b.id;
    });
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
  const [editingItem, setEditingItem] = useState<PublicChecklistItem | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCompletedRoots, setShowCompletedRoots] = useState(false);
  /** Fully-completed root ids present when this detail session opened — hide these until re-open. */
  const [sessionHiddenCompletedIds, setSessionHiddenCompletedIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [swipeListId, setSwipeListId] = useState<number | null>(null);
  const [swipeItemId, setSwipeItemId] = useState<number | null>(null);
  const [listMeta, setListMeta] = useState<PublicChecklist | null>(null);
  const [itemMeta, setItemMeta] = useState<TreeNode | null>(null);
  const [confirmDeleteList, setConfirmDeleteList] = useState<PublicChecklist | PublicChecklistDetail | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<PublicChecklistItem | null>(null);
  const [editingList, setEditingList] = useState<PublicChecklist | PublicChecklistDetail | null>(null);
  const [listTitleDraft, setListTitleDraft] = useState("");
  const [listSharedDraft, setListSharedDraft] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLFormElement | null>(null);
  const createListFormRef = useRef<HTMLFormElement>(null);
  const editListFormRef = useRef<HTMLFormElement>(null);
  const editItemFormRef = useRef<HTMLFormElement>(null);

  useKeepLastItemAboveComposer(composerFocused, listEndRef, composerRef, detail?.itemCount ?? 0);
  useKeepFocusedInScrollParent(showCreate, createListFormRef);
  useKeepFocusedInScrollParent(Boolean(editingList), editListFormRef);
  useKeepFocusedInScrollParent(Boolean(editingItem), editItemFormRef);

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
    async (id: number, opts?: { resetCompletedSession?: boolean }) => {
      if (!token) return;
      setError(null);
      try {
        const data = await checklistsApi.get(token, id);
        setDetail(data);
        setActiveId(id);
        setListMeta(null);
        setSwipeListId(null);
        if (opts?.resetCompletedSession) {
          const roots = buildTree(data.items);
          setSessionHiddenCompletedIds(new Set(completedRootIds(roots)));
          setShowCompletedRoots(false);
        }
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

  const { visibleRoots, completedRootCount } = useMemo(
    () => filterVisibleChecklistRoots(tree, sessionHiddenCompletedIds, showCompletedRoots),
    [tree, sessionHiddenCompletedIds, showCompletedRoots],
  );

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
      await loadDetail(created.id, { resetCompletedSession: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("checklists.errorSave"));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveListEdit(e: FormEvent) {
    e.preventDefault();
    if (!token || !editingList || !listTitleDraft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await checklistsApi.update(token, editingList.id, {
        title: listTitleDraft.trim(),
        isShared: listSharedDraft,
      });
      setEditingList(null);
      await loadLists();
      if (activeId === editingList.id) await loadDetail(editingList.id);
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

  async function handleToggleComplete(node: TreeNode) {
    if (!token || !activeId || busy) return;

    const willComplete = !node.completedAt;
    if (willComplete) {
      const hasIncompleteDescendant = (n: TreeNode): boolean => {
        for (const c of n.children) {
          if (!c.completedAt) return true;
          if (hasIncompleteDescendant(c)) return true;
        }
        return false;
      };
      if (hasIncompleteDescendant(node)) {
        setError(t("checklists.errorChildrenMustComplete"));
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      await checklistsApi.updateItem(token, activeId, node.id, {
        completed: !node.completedAt,
      });
      await loadDetail(activeId);
      await loadLists();
    } catch (err) {
      if (err instanceof ApiError && err.code === "CHILD_INCOMPLETE") {
        setError(t("checklists.errorChildrenMustComplete"));
      } else {
        setError(err instanceof ApiError ? err.message : t("checklists.errorSave"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteItemConfirmed() {
    if (!token || !activeId || !confirmDeleteItem || busy) return;
    setBusy(true);
    setError(null);
    try {
      await checklistsApi.removeItem(token, activeId, confirmDeleteItem.id);
      if (parentForAdd?.id === confirmDeleteItem.id) setParentForAdd(null);
      if (editingItem?.id === confirmDeleteItem.id) {
        setEditingItem(null);
        setEditDraft("");
      }
      setConfirmDeleteItem(null);
      setItemMeta(null);
      await loadDetail(activeId);
      await loadLists();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("checklists.errorSave"));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!token || !activeId || !editingItem || !editDraft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await checklistsApi.updateItem(token, activeId, editingItem.id, {
        title: editDraft.trim(),
      });
      setEditingItem(null);
      setEditDraft("");
      await loadDetail(activeId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("checklists.errorSave"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteListConfirmed() {
    if (!token || !confirmDeleteList || busy) return;
    setBusy(true);
    try {
      await checklistsApi.remove(token, confirmDeleteList.id);
      if (activeId === confirmDeleteList.id) {
        setActiveId(null);
        setDetail(null);
        setSessionHiddenCompletedIds(new Set());
        setShowCompletedRoots(false);
      }
      setConfirmDeleteList(null);
      setListMeta(null);
      await loadLists();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("checklists.errorSave"));
    } finally {
      setBusy(false);
    }
  }

  function openEditList(list: PublicChecklist | PublicChecklistDetail) {
    setEditingList(list);
    setListTitleDraft(list.title);
    setListSharedDraft(list.isShared);
    setListMeta(null);
  }

  function renderNode(node: TreeNode, depth: number) {
    const done = Boolean(node.completedAt);
    return (
      <li key={node.id} className={depth > 0 ? "mt-1" : undefined}>
        <div style={{ paddingLeft: `${depth * 12}px` }}>
          <SwipeableRow
            canDelete
            deleteLabel={t("checklists.deleteItem")}
            actionOpen={swipeItemId === node.id}
            onActionOpenChange={(open) => setSwipeItemId(open ? node.id : null)}
            onPress={() => void handleToggleComplete(node)}
            onLongPress={() => {
              setSwipeItemId(null);
              setItemMeta(node);
            }}
            onDelete={() => {
              setSwipeItemId(null);
              setConfirmDeleteItem(node);
            }}
            className="rounded-xl"
          >
            <div className="flex items-center gap-3 px-3 py-3">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                  done
                    ? "border-teal-500 bg-teal-500 text-white"
                    : "border-neutral-300 bg-white text-transparent"
                }`}
              >
                <Check size={12} strokeWidth={3} />
              </span>
              <span
                className={`min-w-0 flex-1 text-sm font-medium ${
                  done ? "text-neutral-400 line-through" : "text-neutral-800"
                }`}
              >
                {node.title}
              </span>
              {node.children.length > 0 && (
                <span className="text-[10px] font-semibold text-neutral-400">{node.children.length}</span>
              )}
            </div>
          </SwipeableRow>
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
            <button
              type="button"
              onClick={() => {
                setActiveId(null);
                setDetail(null);
                setSessionHiddenCompletedIds(new Set());
                setShowCompletedRoots(false);
                setParentForAdd(null);
                setItemDraft("");
                setEditingItem(null);
                setItemMeta(null);
                setSwipeItemId(null);
                setComposerFocused(false);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-600"
              aria-label={t("checklists.back")}
            >
              <ArrowLeft size={18} />
            </button>
          }
        />

        <div className="mx-auto max-w-md px-4 pt-3 pb-6" style={{ overflowAnchor: "none" }}>
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
            <ul className="flex flex-col gap-2">
              {visibleRoots.map((n) => renderNode(n, 0))}

              {!showCompletedRoots && completedRootCount > 0 && (
                <li>
                  <button
                    type="button"
                    onClick={() => setShowCompletedRoots(true)}
                    className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-indigo-600 shadow-sm ring-1 ring-black/5 active:bg-indigo-50"
                  >
                    {t("checklists.showCompletedRoots", { n: completedRootCount })}
                  </button>
                </li>
              )}
            </ul>
          )}

          <div ref={listEndRef} />

          <form
            ref={composerRef}
            onSubmit={(e) => void handleAddItem(e)}
            className="sticky bottom-2 z-10 mt-3 rounded-2xl border border-black/5 bg-white/95 p-3 shadow-sm backdrop-blur"
          >
            <div>
              {parentForAdd && (
                <div className="mb-2 flex items-center justify-between rounded-lg bg-indigo-50 px-3 py-1.5 text-xs text-indigo-700">
                  <span>{t("checklists.addingUnder", { title: parentForAdd.title })}</span>
                  <button
                    type="button"
                    onClick={() => setParentForAdd(null)}
                    aria-label={t("checklists.clearParent")}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={itemDraft}
                  onChange={(e) => setItemDraft(e.target.value)}
                  onFocus={() => setComposerFocused(true)}
                  onBlur={() => setComposerFocused(false)}
                  placeholder={
                    parentForAdd ? t("checklists.placeholderChild") : t("checklists.placeholderItem")
                  }
                  className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
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

        {itemMeta && (
          <ItemDetailSheet
            title={itemMeta.title}
            onClose={() => setItemMeta(null)}
            closeLabel={t("checklists.cancel")}
            editLabel={t("checklists.editItem")}
            deleteLabel={t("checklists.deleteItem")}
            canManage
            onEdit={() => {
              setEditingItem(itemMeta);
              setEditDraft(itemMeta.title);
              setItemMeta(null);
            }}
            onDelete={() => {
              setConfirmDeleteItem(itemMeta);
              setItemMeta(null);
            }}
          >
            <DetailRow label={t("checklists.itemStatus")}>
              {itemMeta.completedAt ? t("checklists.statusDone") : t("checklists.statusTodo")}
            </DetailRow>
            <button
              type="button"
              onClick={() => {
                setParentForAdd(itemMeta);
                setItemMeta(null);
              }}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-50 py-2.5 text-sm font-semibold text-indigo-600"
            >
              <Plus size={16} /> {t("checklists.addChild")}
            </button>
          </ItemDetailSheet>
        )}

        {editingItem && (
          <OverlayScrim
            className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center"
            onDismiss={() => {
              setEditingItem(null);
              setEditDraft("");
            }}
            label={t("checklists.cancel")}
          >
            <form
              ref={editItemFormRef}
              onSubmit={(e) => void handleSaveEdit(e)}
              className="relative max-h-[var(--sheet-max-height,90vh)] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
              style={{ overflowAnchor: "none" }}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-bold text-neutral-900">{t("checklists.editItem")}</h2>
                <button
                  type="button"
                  onClick={() => {
                    setEditingItem(null);
                    setEditDraft("");
                  }}
                  aria-label={t("checklists.cancel")}
                >
                  <X size={20} className="text-neutral-400" />
                </button>
              </div>
              <input
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
                autoFocus
              />
              <button
                type="submit"
                disabled={busy || !editDraft.trim()}
                className="mt-4 w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                {t("checklists.save")}
              </button>
            </form>
          </OverlayScrim>
        )}

        {confirmDeleteItem && (
          <OverlayScrim
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onDismiss={() => setConfirmDeleteItem(null)}
            label={t("checklists.cancel")}
            swipeToDismiss={false}
          >
            <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
              <h2 className="text-base font-bold text-neutral-900">{t("checklists.deleteItem")}</h2>
              <p className="mt-2 text-sm text-neutral-500">{t("checklists.confirmDeleteItem")}</p>
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteItem(null)}
                  className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-600"
                >
                  {t("checklists.cancel")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDeleteItemConfirmed()}
                  className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {t("checklists.deleteItem")}
                </button>
              </div>
            </div>
          </OverlayScrim>
        )}
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
            {lists.map((list) => {
              const canManage = user?.id === list.userId;
              return (
                <li key={list.id}>
                  <SwipeableRow
                    canDelete={canManage}
                    deleteLabel={t("checklists.deleteList")}
                    actionOpen={swipeListId === list.id}
                    onActionOpenChange={(open) => setSwipeListId(open ? list.id : null)}
                    onPress={() => void loadDetail(list.id, { resetCompletedSession: true })}
                    onLongPress={() => {
                      setSwipeListId(null);
                      setListMeta(list);
                    }}
                    onDelete={() => {
                      setSwipeListId(null);
                      setConfirmDeleteList(list);
                    }}
                  >
                    <div className="flex items-center gap-3 p-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-50">
                        <ListChecks size={18} className="text-teal-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-neutral-900">{list.title}</p>
                        <p className="mt-0.5 text-[11px] text-neutral-400">
                          {list.ownerName} · {t("checklists.itemCount", { n: list.itemCount })} ·{" "}
                          {t("checklists.completedCount", { n: list.completedCount })}
                        </p>
                      </div>
                      <SharedBadge isShared={list.isShared} />
                    </div>
                  </SwipeableRow>
                </li>
              );
            })}
            <p className="text-center text-[11px] text-neutral-400">{t("common.rowHint")}</p>
          </ul>
        )}
      </div>

      {listMeta && (
        <ItemDetailSheet
          title={listMeta.title}
          onClose={() => setListMeta(null)}
          closeLabel={t("checklists.cancel")}
          editLabel={t("checklists.editList")}
          deleteLabel={t("checklists.deleteList")}
          canManage={user?.id === listMeta.userId}
          onEdit={() => openEditList(listMeta)}
          onDelete={() => {
            setConfirmDeleteList(listMeta);
            setListMeta(null);
          }}
        >
          <DetailRow label={t("checklists.itemCount", { n: listMeta.itemCount })}>
            {t("checklists.completedCount", { n: listMeta.completedCount })}
          </DetailRow>
          <DetailRow label={t("checklists.shareWithFamily")}>
            {listMeta.isShared ? t("scope.family") : t("scope.personal")}
            {` · ${listMeta.ownerName}`}
          </DetailRow>
          <button
            type="button"
            onClick={() => void loadDetail(listMeta.id, { resetCompletedSession: true })}
            className="mt-4 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white"
          >
            {t("checklists.openList")}
          </button>
        </ItemDetailSheet>
      )}

      {showCreate && (
        <OverlayScrim
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center"
          onDismiss={() => setShowCreate(false)}
          label={t("checklists.cancel")}
        >
          <form
            ref={createListFormRef}
            onSubmit={(e) => void handleCreateList(e)}
            className="relative max-h-[var(--sheet-max-height,90vh)] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
            style={{ overflowAnchor: "none" }}
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
        </OverlayScrim>
      )}

      {editingList && (
        <OverlayScrim
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center"
          onDismiss={() => setEditingList(null)}
          label={t("checklists.cancel")}
        >
          <form
            ref={editListFormRef}
            onSubmit={(e) => void handleSaveListEdit(e)}
            className="relative max-h-[var(--sheet-max-height,90vh)] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
            style={{ overflowAnchor: "none" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-neutral-900">{t("checklists.editList")}</h2>
              <button type="button" onClick={() => setEditingList(null)} aria-label={t("checklists.cancel")}>
                <X size={20} className="text-neutral-400" />
              </button>
            </div>
            <input
              value={listTitleDraft}
              onChange={(e) => setListTitleDraft(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
              autoFocus
            />
            {family && (
              <label className="mt-3 flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={listSharedDraft}
                  onChange={(e) => setListSharedDraft(e.target.checked)}
                  className="rounded border-neutral-300"
                />
                <Share2 size={14} className="text-indigo-500" />
                {t("checklists.shareWithFamily")}
              </label>
            )}
            <button
              type="submit"
              disabled={busy || !listTitleDraft.trim()}
              className="mt-4 w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {t("checklists.save")}
            </button>
          </form>
        </OverlayScrim>
      )}

      {confirmDeleteList && (
        <OverlayScrim
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onDismiss={() => setConfirmDeleteList(null)}
          label={t("checklists.cancel")}
          swipeToDismiss={false}
        >
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="text-base font-bold text-neutral-900">{t("checklists.deleteList")}</h2>
            <p className="mt-2 text-sm text-neutral-500">{t("checklists.confirmDeleteList")}</p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteList(null)}
                className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-600"
              >
                {t("checklists.cancel")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDeleteListConfirmed()}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {t("checklists.deleteList")}
              </button>
            </div>
          </div>
        </OverlayScrim>
      )}
    </div>
  );
}
