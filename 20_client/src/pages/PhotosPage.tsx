import { useState } from "react";
import { Cloud, Plus } from "lucide-react";
import TopBar from "../components/TopBar";
import ScopeToggle, { type ViewScope } from "../components/ScopeToggle";
import { photos } from "../mocks/data";
import { useLanguage } from "../i18n/LanguageContext";

export default function PhotosPage() {
  const { lang, t } = useLanguage();
  const [scope, setScope] = useState<ViewScope>("all");

  const visible = photos.filter((p) =>
    scope === "all" ? true : scope === "personal" ? !p.isShared : p.isShared,
  );

  return (
    <div>
      <TopBar
        title={t("photos.title")}
        subtitle={t("photos.subtitle")}
        right={
          <button className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white">
            <Plus size={18} />
          </button>
        }
      />

      <div className="mx-auto max-w-md px-4 pt-4">
        <ScopeToggle value={scope} onChange={setScope} />

        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-50">
            <Cloud size={18} className="text-sky-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-neutral-800">{t("photos.synced")}</p>
            <p className="text-[11px] text-neutral-400">{t("photos.lastSync")}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-1.5">
          {visible.map((p) => (
            <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg">
              <div className="h-full w-full" style={{ backgroundColor: p.color }} />
              {p.isShared && (
                <span className="absolute right-1 top-1 rounded-full bg-black/30 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  {t("photos.familyBadge")}
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-3">
                <p className="truncate text-[10px] font-medium text-white">{p.caption[lang]}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
