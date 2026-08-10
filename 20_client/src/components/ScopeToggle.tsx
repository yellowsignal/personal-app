import { useLanguage } from "../i18n/LanguageContext";

export type ViewScope = "all" | "personal" | "family";

const OPTIONS: { value: ViewScope; key: string }[] = [
  { value: "all", key: "scope.all" },
  { value: "personal", key: "scope.personal" },
  { value: "family", key: "scope.family" },
];

export default function ScopeToggle({
  value,
  onChange,
}: {
  value: ViewScope;
  onChange: (v: ViewScope) => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-neutral-100 p-1">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded-lg py-1.5 text-xs font-semibold transition-colors ${
            value === opt.value
              ? "bg-white text-indigo-600 shadow-sm"
              : "text-neutral-500"
          }`}
        >
          {t(opt.key)}
        </button>
      ))}
    </div>
  );
}
