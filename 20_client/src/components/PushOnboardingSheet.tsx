import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import OverlayScrim from "./OverlayScrim";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import { enableHomeScreenPush, isStandaloneDisplay } from "../api/push";
import {
  markPushOnboardingAsked,
  notificationPermission,
  readPushOnboardingAsked,
  shouldShowPushOnboarding,
} from "../api/pushOnboarding";

export default function PushOnboardingSheet() {
  const { token, loading } = useAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !token) return;
    const standalone = isStandaloneDisplay();
    const permission = notificationPermission();
    const alreadyAsked = readPushOnboardingAsked();

    if (standalone && permission === "granted" && !alreadyAsked) {
      markPushOnboardingAsked();
      void enableHomeScreenPush(token);
      return;
    }

    const show = shouldShowPushOnboarding({
      hasToken: true,
      standalone,
      permission,
      alreadyAsked,
    });
    if (!show) return;
    const timer = window.setTimeout(() => setOpen(true), 600);
    return () => window.clearTimeout(timer);
  }, [token, loading]);

  function dismiss() {
    markPushOnboardingAsked();
    setOpen(false);
  }

  async function allow() {
    if (!token || busy) return;
    setBusy(true);
    try {
      await enableHomeScreenPush(token);
    } finally {
      markPushOnboardingAsked();
      setBusy(false);
      setOpen(false);
    }
  }

  if (!open) return null;

  return (
    <OverlayScrim
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onDismiss={dismiss}
      label={t("pushOnboarding.later")}
      swipeToDismiss={false}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-indigo-50">
          <Bell size={20} className="text-indigo-600" />
        </div>
        <h2 className="text-base font-bold text-neutral-900">{t("pushOnboarding.title")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">{t("pushOnboarding.body")}</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-600"
          >
            {t("pushOnboarding.later")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void allow()}
            className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t("pushOnboarding.allow")}
          </button>
        </div>
      </div>
    </OverlayScrim>
  );
}
