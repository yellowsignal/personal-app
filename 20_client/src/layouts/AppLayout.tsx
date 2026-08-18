import { useCallback } from "react";
import { Outlet, useLocation } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import OverlayBackdropHost from "../components/OverlayBackdropHost";
import PushOnboardingSheet from "../components/PushOnboardingSheet";
import { useBodyScrollLock, useResetWindowScroll } from "../hooks/useBodyScrollLock";
import { useOnAppResume } from "../hooks/useOnAppResume";
import { useAuth } from "../context/AuthContext";
import { familyActivityApi, syncAppBadge } from "../api/familyActivity";

export default function AppLayout() {
  const { pathname } = useLocation();
  const { token } = useAuth();
  const hideBottomNav = /^\/assets\/\d+\/statement\/?$/.test(pathname);
  const isHome = pathname === "/";

  // SPA route changes keep window scroll; also clears stale offset when leaving home lock.
  useResetWindowScroll(pathname);

  // Home uses a fixed viewport; do not restore the previous page's scrollY when leaving home.
  useBodyScrollLock(isHome, { restoreScroll: false });

  const refreshAppBadge = useCallback(() => {
    if (!token) return;
    void familyActivityApi
      .summary(token)
      .then((summary) => syncAppBadge(summary.unreadCount))
      .catch(() => {
        /* ignore — badge is best-effort */
      });
  }, [token]);

  // Keep the home-screen icon badge in sync when returning from iOS home,
  // even if the user was on Calendar/etc. (not only Dashboard mount).
  useOnAppResume(refreshAppBadge);

  return (
    <div className={`flex justify-center bg-neutral-200 ${isHome ? "h-[100dvh] overflow-hidden overscroll-none" : "min-h-screen"}`}>
      <div
        className={`relative flex w-full max-w-md flex-col bg-[#f2f2f7] shadow-2xl ${
          isHome ? "h-[100dvh] max-h-[100dvh] overflow-hidden overscroll-none" : "min-h-screen"
        }`}
      >
        <div
          className={
            hideBottomNav
              ? "flex-1"
              : isHome
                ? "flex min-h-0 flex-1 flex-col overflow-hidden pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))]"
                : "flex-1 pb-24"
          }
        >
          <Outlet />
        </div>
        {!hideBottomNav && <BottomNav />}
        <OverlayBackdropHost />
        <PushOnboardingSheet />
      </div>
    </div>
  );
}
