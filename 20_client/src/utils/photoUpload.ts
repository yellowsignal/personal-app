export const MAX_PHOTO_UPLOAD = 20;
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

export interface SelectedImages {
  files: File[];
  skippedNonImage: number;
  skippedTooLarge: number;
  truncated: number;
}

function looksLikeImage(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  if (!file.type || file.type === "application/octet-stream") {
    return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
  }
  return false;
}

export function selectImageFiles(
  list: ArrayLike<File>,
  opts: { maxCount?: number; maxBytes?: number } = {},
): SelectedImages {
  const maxCount = opts.maxCount ?? MAX_PHOTO_UPLOAD;
  const maxBytes = opts.maxBytes ?? MAX_PHOTO_BYTES;
  const files: File[] = [];
  let skippedNonImage = 0;
  let skippedTooLarge = 0;
  let truncated = 0;
  const all = Array.from(list);
  for (const file of all) {
    if (!looksLikeImage(file)) {
      skippedNonImage += 1;
      continue;
    }
    if (file.size > maxBytes) {
      skippedTooLarge += 1;
      continue;
    }
    if (files.length >= maxCount) {
      truncated += 1;
      continue;
    }
    files.push(file);
  }
  return { files, skippedNonImage, skippedTooLarge, truncated };
}

export const MAX_ICLOUD_ALBUMS = 8;

export interface SaveBlobHooks {
  share?: (data: { files: File[]; title: string }) => Promise<void>;
  canShare?: (data: { files: File[] }) => boolean;
  clickDownload?: (href: string, filename: string) => void;
}

export async function saveBlobLocally(
  blob: Blob,
  filename: string,
  hooks: SaveBlobHooks = {},
): Promise<"shared" | "downloaded"> {
  const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
  const share = hooks.share ?? (typeof navigator !== "undefined" && navigator.share ? navigator.share.bind(navigator) : undefined);
  const canShare =
    hooks.canShare ??
    (typeof navigator !== "undefined" && "canShare" in navigator
      ? (data: { files: File[] }) => {
          try {
            return navigator.canShare(data);
          } catch {
            return false;
          }
        }
      : undefined);
  if (share && (!canShare || canShare({ files: [file] }))) {
    try {
      await share({ files: [file], title: filename });
      return "shared";
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return "shared";
    }
  }
  const href = URL.createObjectURL(blob);
  try {
    if (hooks.clickDownload) {
      hooks.clickDownload(href, filename);
    } else if (typeof document !== "undefined") {
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(href), 1_000);
  }
  return "downloaded";
}

