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
