import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Fingerprint, Globe, House, KeyRound, Mail, UserPlus } from "lucide-react";
import { ApiError } from "../api/http";
import { isPasskeySupported } from "../api/passkey";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";

type Mode = "login" | "signup";

function passkeyErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object" && err && "name" in err) {
    const name = String((err as { name?: string }).name ?? "");
    const message = String((err as { message?: string }).message ?? "");
    if (name === "NotAllowedError") return "Passkey 등록이 취소되었거나 허용되지 않았습니다.";
    if (name === "InvalidStateError") return "이미 이 기기에 등록된 Passkey가 있습니다.";
    if (name === "SecurityError") return "보안 오류: HTTPS 도메인과 RP ID를 확인하세요.";
    if (message) return `${name}: ${message}`;
  }
  return fallback;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { token, login, register, passkeyLogin, passkeyRegister } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const { lang, toggleLang, t } = useLanguage();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passkeyReady = isPasskeySupported();

  if (token) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        const code = inviteCode.trim().toUpperCase();
        await register({
          email: email.trim(),
          password,
          name: name.trim(),
          inviteCode: code ? (code.startsWith("FAM-") ? code : `FAM-${code}`) : undefined,
        });
      }
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError(t("login.error.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  async function onPasskeyLogin() {
    setError(null);
    setSubmitting(true);
    try {
      await passkeyLogin();
      navigate("/", { replace: true });
    } catch (err) {
      setError(passkeyErrorMessage(err, t("login.error.passkey")));
    } finally {
      setSubmitting(false);
    }
  }

  async function onPasskeySignup() {
    setError(null);
    if (!name.trim()) {
      setError(t("login.error.nameRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const tokenValue = inviteToken.trim().toUpperCase();
      await passkeyRegister({
        flow: tokenValue ? "invite" : "bootstrap",
        name: name.trim(),
        inviteToken: tokenValue || undefined,
      });
      navigate("/", { replace: true });
    } catch (err) {
      setError(passkeyErrorMessage(err, t("login.error.passkey")));
    } finally {
      setSubmitting(false);
    }
  }

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
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
              mode === "login" ? "bg-white text-indigo-600 shadow-sm" : "text-neutral-400"
            }`}
          >
            {t("login.tab.login")}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
              mode === "signup" ? "bg-white text-indigo-600 shadow-sm" : "text-neutral-400"
            }`}
          >
            {t("login.tab.signup")}
          </button>
        </div>

        {passkeyReady && (
          <button
            type="button"
            disabled={submitting}
            onClick={() => void (mode === "login" ? onPasskeyLogin() : onPasskeySignup())}
            className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Fingerprint size={18} />
            {mode === "login" ? t("login.button.faceId") : t("login.button.passkeySignup")}
          </button>
        )}

        <p className="mt-3 text-center text-[11px] text-neutral-400">{t("login.passkeyHint")}</p>

        <form className="mt-6 flex flex-col gap-3" onSubmit={onSubmit}>
          {mode === "signup" && (
            <label className="flex items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3">
              <UserPlus size={18} className="text-neutral-400" />
              <input
                className="w-full text-base outline-none placeholder:text-neutral-300"
                placeholder={t("login.placeholder.name")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </label>
          )}
          {mode === "signup" && (
            <label className="flex items-center gap-3 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 px-4 py-3">
              <span className="text-xs font-semibold text-indigo-500">OTP</span>
              <input
                className="w-full text-base uppercase outline-none placeholder:text-neutral-300"
                placeholder={t("login.placeholder.inviteToken")}
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                autoComplete="off"
              />
            </label>
          )}
          <label className="flex items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3">
            <Mail size={18} className="text-neutral-400" />
            <input
              type="email"
              className="w-full text-base outline-none placeholder:text-neutral-300"
              placeholder={t("login.placeholder.email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required={mode === "login" || Boolean(inviteCode.trim())}
              autoComplete="email"
            />
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3">
            <KeyRound size={18} className="text-neutral-400" />
            <input
              type="password"
              className="w-full text-base outline-none placeholder:text-neutral-300"
              placeholder={t("login.placeholder.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={mode === "login" || Boolean(email.trim())}
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>
          {mode === "signup" && (
            <label className="flex items-center gap-3 rounded-xl border border-dashed border-neutral-200 px-4 py-3">
              <span className="text-sm font-semibold text-neutral-400">FAM-</span>
              <input
                className="w-full text-base uppercase outline-none placeholder:text-neutral-300"
                placeholder={t("login.placeholder.inviteLegacy")}
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                autoComplete="off"
              />
            </label>
          )}

          {error && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-xl border border-indigo-200 py-3 text-sm font-semibold text-indigo-600 disabled:opacity-60"
          >
            {submitting
              ? t("login.button.working")
              : mode === "login"
                ? t("login.button.loginPassword")
                : t("login.button.signupPassword")}
          </button>
        </form>

        <p className="mt-auto pb-8 pt-6 text-center text-[11px] leading-relaxed text-neutral-300">
          {t("login.apiNotice")}
        </p>
      </div>
    </div>
  );
}
