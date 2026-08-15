import { scoreOcrTextForDocuments } from "@personal-app/document-ocr-parse";

const MAX_EDGE = 1800;
/** Stop trying more angles once OCR text looks clearly like a known document. */
const GOOD_ENOUGH_SCORE = 110;

async function fileToBitmap(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

function drawOriented(
  bitmap: ImageBitmap,
  quarterTurns: 0 | 1 | 2 | 3,
): HTMLCanvasElement {
  const srcW = bitmap.width;
  const srcH = bitmap.height;
  const scale = Math.min(1, MAX_EDGE / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.width = w;
    canvas.height = h;
    return canvas;
  }

  if (quarterTurns % 2 === 0) {
    canvas.width = w;
    canvas.height = h;
  } else {
    canvas.width = h;
    canvas.height = w;
  }

  ctx.save();
  if (quarterTurns === 1) {
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
  } else if (quarterTurns === 2) {
    ctx.translate(canvas.width, canvas.height);
    ctx.rotate(Math.PI);
  } else if (quarterTurns === 3) {
    ctx.translate(0, canvas.height);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  ctx.restore();

  // Mild contrast — heavy boost was washing out small JP digits on 保険証.
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    const boosted = gray < 140 ? Math.max(0, gray - 12) : Math.min(255, gray + 18);
    data[i] = boosted;
    data[i + 1] = boosted;
    data[i + 2] = boosted;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("preprocess failed"))), "image/jpeg", 0.92);
  });
}

/**
 * Portrait photos of landscape cards (保険証 etc.) often need a 90° rotate.
 * Try a few orientations and keep the text that scores highest for document keywords.
 */
export async function runOcrOnFile(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const bitmap = await fileToBitmap(file);

  // Prefer upright first; then ±90° (sideways phone shots); 180° last.
  const turns: Array<0 | 1 | 2 | 3> =
    bitmap.height >= bitmap.width ? [0, 1, 3, 2] : [0, 3, 1, 2];

  const worker = await createWorker("jpn+kor+eng", 1, {
    logger: (m: { status?: string; progress?: number }) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") {
        // progress spans attempts coarsely
        onProgress?.(Math.min(0.98, m.progress));
      }
    },
  });

  let bestText = "";
  let bestScore = Number.NEGATIVE_INFINITY;

  try {
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i]!;
      const canvas = drawOriented(bitmap, turn);
      const blob = await canvasToBlob(canvas);
      const { data } = await worker.recognize(blob, { rotateAuto: true });
      const text = data.text ?? "";
      const score = scoreOcrTextForDocuments(text);
      if (score > bestScore) {
        bestScore = score;
        bestText = text;
      }
      onProgress?.((i + 1) / turns.length);
      if (bestScore >= GOOD_ENOUGH_SCORE) break;
    }
  } finally {
    bitmap.close();
    await worker.terminate();
  }

  return bestText;
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
