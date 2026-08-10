import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Fingerprint, Globe, House, KeyRound, Mail, UserPlus } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

type Mode = "login" | "signup";

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const { lang, toggleLang, t } = useLanguage();

  return (
    <div className="safe-top safe-bottom flex min-h-screen justify-center bg-white">
      <div className="flex w-full max-w-md flex-col px-6 pt-14">
        <button
          onClick={toggleLang}
          className="ml-auto flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-500"
        >
          <Globe size={13} />
          {lang === "ko" ? "한국어" : "日本語"}
        </button>

        <div className="mt-10 flex flex-col items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600">
            <House size={30} color="white" strokeWidth={2.2} />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-neutral-900">MyFamily Hub</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {mode === "login" ? t("login.tagline.login") : t("login.tagline.signup")}
          </p>
        </div>

        <div className="mt-8 flex rounded-xl bg-neutral-100 p-1">
          <button
            onClick={() => setMode("login")}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
              mode === "login" ? "bg-white text-indigo-600 shadow-sm" : "text-neutral-400"
            }`}
          >
            {t("login.tab.login")}
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
              mode === "signup" ? "bg-white text-indigo-600 shadow-sm" : "text-neutral-400"
            }`}
          >
            {t("login.tab.signup")}
          </button>
        </div>

        <form
          className="mt-6 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            navigate("/");
          }}
        >
          {mode === "signup" && (
            <label className="flex items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3">
              <UserPlus size={18} className="text-neutral-400" />
              <input
                className="w-full text-sm outline-none placeholder:text-neutral-300"
                placeholder={t("login.placeholder.name")}
              />
            </label>
          )}
          <label className="flex items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3">
            <Mail size={18} className="text-neutral-400" />
            <input
              type="email"
              className="w-full text-sm outline-none placeholder:text-neutral-300"
              placeholder={t("login.placeholder.email")}
              defaultValue={mode === "login" ? "minho@example.com" : ""}
            />
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3">
            <KeyRound size={18} className="text-neutral-400" />
            <input
              type="password"
              className="w-full text-sm outline-none placeholder:text-neutral-300"
              placeholder={t("login.placeholder.password")}
              defaultValue={mode === "login" ? "••••••••" : ""}
            />
          </label>
          {mode === "signup" && (
            <label className="flex items-center gap-3 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 px-4 py-3">
              <span className="text-sm font-semibold text-indigo-500">FAM-</span>
              <input
                className="w-full text-sm uppercase outline-none placeholder:text-neutral-300"
                placeholder={t("login.placeholder.invite")}
              />
            </label>
          )}

          <button
            type="submit"
            className="mt-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white active:bg-indigo-700"
          >
            {mode === "login" ? t("login.button.login") : t("login.button.signup")}
          </button>
        </form>

        {mode === "login" && (
          <button
            onClick={() => navigate("/")}
            className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-neutral-200 py-3 text-sm font-semibold text-neutral-700"
          >
            <Fingerprint size={18} className="text-indigo-500" />
            {t("login.button.faceId")}
          </button>
        )}

        <p className="mt-auto pb-8 pt-10 text-center text-[11px] leading-relaxed text-neutral-300">
          {t("login.mockupNotice")}
        </p>
      </div>
    </div>
  );
}
