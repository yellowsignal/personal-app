import { useState } from "react";
import { Camera, Plus } from "lucide-react";
import TopBar from "../components/TopBar";
import ScopeToggle, { type ViewScope } from "../components/ScopeToggle";
import SharedBadge from "../components/SharedBadge";
import { documents } from "../mocks/data";
import { useLanguage } from "../i18n/LanguageContext";

export default function DocumentsPage() {
  const { lang, t } = useLanguage();
  const [scope, setScope] = useState<ViewScope>("all");

  const visible = documents
    .filter((d) => (scope === "all" ? true : scope === "personal" ? !d.isShared : d.isShared))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  return (
    <div>
      <TopBar
        title={t("documents.title")}
        subtitle={t("documents.subtitle")}
        right={
          <button className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white">
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
          {visible.map((d) => {
            const urgent = d.daysLeft <= 30;
            return (
              <div key={d.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] font-semibold text-neutral-400">{d.owner[lang]}</p>
                    <p className="mt-0.5 text-sm font-bold text-neutral-900">{t(`documentType.${d.docType}`)}</p>
                    <p className="mt-0.5 font-mono text-xs text-neutral-400">{d.docNumber}</p>
                  </div>
                  <SharedBadge isShared={d.isShared} />
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-neutral-400">{t("documents.expiryLabel", { date: d.expiryDate })}</span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      urgent ? "bg-rose-50 text-rose-500" : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    D-{d.daysLeft}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
