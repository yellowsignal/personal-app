async function preprocessImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const maxW = 1800;
  const scale = Math.min(1, maxW / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, w, h);
  const { data } = imageData;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    const boosted = gray < 128 ? Math.max(0, gray - 20) : Math.min(255, gray + 30);
    data[i] = boosted;
    data[i + 1] = boosted;
    data[i + 2] = boosted;
  }
  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("preprocess failed"))), "image/jpeg", 0.92);
  });
}

export async function runOcrOnFile(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const prepared = await preprocessImage(file);
  const worker = await createWorker("jpn+kor+eng", 1, {
    logger: (m: { status?: string; progress?: number }) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") {
        onProgress?.(m.progress);
      }
    },
  });
  try {
    const { data } = await worker.recognize(prepared);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

export async function runOcrOnFiles(
  files: File[],
  onProgress?: (progress: number) => void,
): Promise<string> {
  if (files.length === 0) return "";
  const parts: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const base = i / files.length;
    const span = 1 / files.length;
    const text = await runOcrOnFile(files[i]!, (p) => onProgress?.(base + p * span));
    parts.push(text);
  }
  return parts.join("\n\n");
}
