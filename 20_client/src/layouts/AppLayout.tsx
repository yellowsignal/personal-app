import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import PushOnboardingSheet from "../components/PushOnboardingSheet";
import { resetWindowScroll, useBodyScrollLock } from "../hooks/useBodyScrollLock";

export default function AppLayout() {
  const { pathname } = useLocation();
  const hideBottomNav = /^\/assets\/\d+\/statement\/?$/.test(pathname);
  const isHome = pathname === "/";

  useEffect(() => {
    // SPA route changes keep window scroll; home lock/unlock can also re-apply an old offset on iOS.
    // Reset immediately and again on the next frames so TopBar is never clipped after navigation.
    resetWindowScroll();
    const raf1 = window.requestAnimationFrame(() => {
      resetWindowScroll();
      window.requestAnimationFrame(resetWindowScroll);
    });
    const t0 = window.setTimeout(resetWindowScroll, 0);
    const t1 = window.setTimeout(resetWindowScroll, 50);
    return () => {
      window.cancelAnimationFrame(raf1);
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [pathname]);

  // Home uses a fixed viewport; do not restore the previous page's scrollY when leaving home.
  useBodyScrollLock(isHome, { restoreScroll: false });

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
        <PushOnboardingSheet />
      </div>
    </div>
  );
}
