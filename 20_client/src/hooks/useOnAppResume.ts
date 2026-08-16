import { useEffect, useRef } from "react";

export function shouldRefreshOnVisibilityState(
  state: DocumentVisibilityState | null | undefined,
): boolean {
  if (state == null) return true;
  return state === "visible";
}

/**
 * Run `onResume` when the PWA returns to the foreground (iOS home → app,
 * tab focus, bfcache pageshow). Debounced so visibility + focus don't
 * double-fetch.
 */
export function useOnAppResume(onResume: () => void): void {
  const onResumeRef = useRef(onResume);
  onResumeRef.current = onResume;

  useEffect(() => {
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        onResumeRef.current();
      }, 50);
    };

    const onVisibility = () => {
      if (shouldRefreshOnVisibilityState(document.visibilityState)) schedule();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", schedule);
    window.addEventListener("focus", schedule);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", schedule);
      window.removeEventListener("focus", schedule);
    };
  }, []);
}
