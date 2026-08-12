import { NavLink } from "react-router-dom";
import { Home, Wallet, ListChecks, CreditCard, CalendarDays } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

const NAV_ITEMS = [
  { to: "/", key: "nav.home", icon: Home, end: true },
  { to: "/assets", key: "nav.assets", icon: Wallet },
  { to: "/checklists", key: "nav.checklists", icon: ListChecks },
  { to: "/subscriptions", key: "nav.subscriptions", icon: CreditCard },
  { to: "/calendar", key: "nav.calendar", icon: CalendarDays },
];

export default function BottomNav() {
  const { t } = useLanguage();

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-black/5 bg-white/90 backdrop-blur">
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2">
        {NAV_ITEMS.map(({ to, key, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors ${
                  isActive ? "text-indigo-600" : "text-neutral-400"
                }`
              }
            >
              <Icon size={22} strokeWidth={2} />
              {t(key)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
