import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import OverlayScrim from "./OverlayScrim";

const ITEM_H = 44;
const VISIBLE = 5;

export type YearMonthValue = { year: number; month: number };

function WheelColumn({
  options,
  value,
  onChange,
}: {
  options: { value: number; label: string }[];
  value: number;
  onChange: (value: number) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  function scrollToIndex(index: number, smooth: boolean) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: index * ITEM_H, behavior: smooth ? "smooth" : "auto" });
  }

  useLayoutEffect(() => {
    const idx = options.findIndex((o) => o.value === value);
    if (idx >= 0) scrollToIndex(idx, false);
    // initial mount only — parent remounts picker when opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const commit = () => {
      const idx = Math.max(0, Math.min(optionsRef.current.length - 1, Math.round(el.scrollTop / ITEM_H)));
      const next = optionsRef.current[idx]?.value;
      if (next != null && next !== valueRef.current) onChangeRef.current(next);
      const snapped = idx * ITEM_H;
      if (Math.abs(el.scrollTop - snapped) > 1) {
        el.scrollTo({ top: snapped, behavior: "smooth" });
      }
    };

    let timer = 0;
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(commit, 70);
      const idx = Math.max(0, Math.min(optionsRef.current.length - 1, Math.round(el.scrollTop / ITEM_H)));
      const next = optionsRef.current[idx]?.value;
      if (next != null && next !== valueRef.current) onChangeRef.current(next);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("scrollend", commit);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scrollend", commit);
    };
  }, []);

  const pad = ITEM_H * Math.floor(VISIBLE / 2);

  return (
    <div className="relative h-[220px] flex-1 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-3 top-1/2 z-0 h-11 -translate-y-1/2 rounded-lg bg-neutral-100"
        aria-hidden
      />
      <div
        ref={scrollerRef}
        className="relative z-10 h-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          scrollSnapType: "y mandatory",
          paddingTop: pad,
          paddingBottom: pad,
          WebkitOverflowScrolling: "touch",
          maskImage: "linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent)",
        }}
      >
        {options.map((opt, idx) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              onChange(opt.value);
              scrollToIndex(idx, true);
            }}
            className={`flex w-full shrink-0 snap-center items-center justify-center text-[17px] ${
              opt.value === value ? "font-semibold text-neutral-900" : "font-medium text-neutral-400"
            }`}
            style={{ height: ITEM_H }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function YearMonthWheelPicker({
  value,
  onConfirm,
  onCancel,
}: {
  value: YearMonthValue;
  onConfirm: (next: YearMonthValue) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [year, setYear] = useState(value.year);
  const [month, setMonth] = useState(value.month);
  const now = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const out: { value: number; label: string }[] = [];
    for (let y = now - 10; y <= now + 15; y++) {
      out.push({ value: y, label: t("calendar.yearUnit", { year: y }) });
    }
    return out;
  }, [now, t]);
  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        value: i,
        label: t("calendar.monthUnit", { month: i + 1 }),
      })),
    [t],
  );

  return (
    <OverlayScrim
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onDismiss={onCancel}
      label={t("calendar.cancel")}
    >
      <div className="relative w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={onCancel} className="px-1 text-sm font-semibold text-neutral-400">
            {t("calendar.cancel")}
          </button>
          <p className="text-sm font-bold text-neutral-900">{t("calendar.pickYearMonth")}</p>
          <button
            type="button"
            onClick={() => onConfirm({ year, month })}
            className="px-1 text-sm font-semibold text-indigo-600"
          >
            {t("calendar.done")}
          </button>
        </div>
        <div className="flex gap-2">
          <WheelColumn options={yearOptions} value={year} onChange={setYear} />
          <WheelColumn options={monthOptions} value={month} onChange={setMonth} />
        </div>
      </div>
    </OverlayScrim>
  );
}
