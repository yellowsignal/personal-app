import { Lock, Users } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

export default function SharedBadge({ isShared }: { isShared: boolean }) {
  const { t } = useLanguage();

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        isShared ? "bg-emerald-50 text-emerald-600" : "bg-neutral-100 text-neutral-500"
      }`}
    >
      {isShared ? <Users size={11} /> : <Lock size={11} />}
      {isShared ? t("scope.family") : t("scope.personal")}
    </span>
  );
}
