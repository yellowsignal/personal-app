import type { ReactNode } from "react";

export default function TopBar({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <header className="safe-top sticky top-0 z-10 border-b border-black/5 bg-white/90 px-4 pb-3 pt-4 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-neutral-900">{title}</h1>
          {subtitle && <p className="text-xs text-neutral-400">{subtitle}</p>}
        </div>
        {right}
      </div>
    </header>
  );
}
