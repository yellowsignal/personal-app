import { useEffect, useState } from "react";
import { photosApi } from "../api/photos";

/** Load an authenticated image path into a blob: URL for <img src>. */
export function useAuthedImage(token: string | null | undefined, path: string | null | undefined) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !path) {
      setSrc(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const blob = await photosApi.fetchIcloudCover(token, path);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setSrc(null);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token, path]);

  return src;
}
