import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Copy, Fingerprint, Globe, LogOut, Users } from "lucide-react";
import TopBar from "../components/TopBar";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, family, logout } = useAuth();
  const { lang, toggleLang, t } = useLanguage();
  const [biometric, setBiometric] = useState(false);
  const [copied, setCopied] = useState(false);

  const initial = (user?.name?.trim()?.charAt(0) || "?").toUpperCase();
  const memberCount = family?.members.length ?? 0;

  async function copyInvite() {
    if (!family?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(family.inviteCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div>
      <TopBar title={t("settings.title")} subtitle={t("settings.subtitle")} />

      <div className="mx-auto max-w-md px-4 pt-4">
        <section className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-base font-bold text-white">
            {initial}
          </div>
          <div>
            <p className="text-sm font-bold text-neutral-900">{user?.name ?? "—"}</p>
            <p className="text-xs text-neutral-400">{user?.email ?? ""}</p>
          </div>
        </section>

        <section className="mt-4 rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Users size={18} className="text-neutral-400" />
              <div>
                <p className="text-sm font-medium text-neutral-800">
                  {family?.familyName ?? t("settings.noFamily")}
                </p>
                <p className="text-[11px] text-neutral-400">
                  {t("settings.membersCount", { n: memberCount })}
                </p>
              </div>
            </div>
          </div>
          {family && (
            <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3">
              <div>
                <p className="text-[11px] text-neutral-400">{t("settings.inviteCode")}</p>
                <p className="font-mono text-sm font-bold text-indigo-600">{family.inviteCode}</p>
              </div>
              <button
                type="button"
                onClick={() => void copyInvite()}
                className="flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-500"
              >
                <Copy size={12} /> {copied ? t("settings.copied") : t("settings.copy")}
              </button>
            </div>
          )}
        </section>

        <section className="mt-4 divide-y divide-neutral-100 rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
          <button
            type="button"
            onClick={toggleLang}
            className="flex w-full items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <Globe size={18} className="text-neutral-400" />
              <span className="text-sm font-medium text-neutral-800">{t("settings.language")}</span>
            </div>
            <span className="flex items-center gap-1 text-sm text-neutral-400">
              {lang === "ko" ? "한국어" : "日本語"}
              <ChevronRight size={16} />
            </span>
          </button>

          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Fingerprint size={18} className="text-neutral-400" />
              <span className="text-sm font-medium text-neutral-800">{t("settings.faceId")}</span>
            </div>
            <button
              type="button"
              onClick={() => setBiometric((v) => !v)}
              className={`h-6 w-10 rounded-full p-0.5 transition-colors ${
                biometric ? "bg-indigo-600" : "bg-neutral-200"
              }`}
            >
              <span
                className={`block h-5 w-5 rounded-full bg-white transition-transform ${
                  biometric ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </section>

        <button
          type="button"
          onClick={() => {
            logout();
            navigate("/login", { replace: true });
          }}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 py-3 text-sm font-semibold text-rose-500"
        >
          <LogOut size={16} />
          {t("settings.logout")}
        </button>
      </div>
    </div>
  );
}
