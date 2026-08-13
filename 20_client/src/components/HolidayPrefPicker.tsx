import { useLanguage } from "../i18n/LanguageContext";

export type HolidayPref = "KR" | "JP" | "BOTH";

const OPTIONS: { value: HolidayPref; key: string }[] = [
  { value: "KR", key: "calendar.holidayKR" },
  { value: "JP", key: "calendar.holidayJP" },
  { value: "BOTH", key: "calendar.holidayBoth" },
];

export function parseHolidayPref(value: string | null | undefined): HolidayPref {
  if (value === "KR" || value === "JP" || value === "BOTH") return value;
  return "JP";
}

export default function HolidayPrefPicker({
  value,
  onChange,
  disabled,
}: {
  value: HolidayPref;
  onChange: (v: HolidayPref) => void;
  disabled?: boolean;
}) {
  const { t } = useLanguage();

  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-neutral-100 p-1">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={`rounded-lg py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
            value === opt.value ? "bg-white text-indigo-600 shadow-sm" : "text-neutral-500"
          }`}
        >
          {t(opt.key)}
        </button>
      ))}
    </div>
  );
}
