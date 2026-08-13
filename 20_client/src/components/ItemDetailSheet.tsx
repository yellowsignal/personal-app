import type { ReactNode } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import OverlayScrim from "./OverlayScrim";

export function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-neutral-100 py-3 last:border-0">
      <p className="shrink-0 pt-0.5 text-xs font-semibold text-neutral-400">{label}</p>
      <div className="min-w-0 text-right text-sm text-neutral-900">{children}</div>
    </div>
  );
}

export default function ItemDetailSheet({
  title,
  onClose,
  onEdit,
  onDelete,
  canManage,
  closeLabel,
  editLabel,
  deleteLabel,
  children,
}: {
  title: string;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  canManage?: boolean;
  closeLabel: string;
  editLabel: string;
  deleteLabel: string;
  children: ReactNode;
}) {
  return (
    <OverlayScrim
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onDismiss={onClose}
      label={closeLabel}
    >
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="min-w-0 truncate text-base font-bold text-neutral-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100"
            aria-label={closeLabel}
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-1">{children}</div>
        {canManage && (onEdit || onDelete) && (
          <div className="mt-5 flex gap-2">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-700"
              >
                <Pencil size={14} /> {editLabel}
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white"
              >
                <Trash2 size={14} /> {deleteLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </OverlayScrim>
  );
}
