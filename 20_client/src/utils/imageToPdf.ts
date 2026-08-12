function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("failed to read file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("failed to load image"));
    img.src = src;
  });
}

/** Minimal jsPDF surface used for image layout (avoids static import for tsc). */
interface PdfCanvas {
  addPage(): void;
  internal: { pageSize: { getWidth(): number; getHeight(): number } };
  getImageProperties(src: string): { width: number; height: number };
  addImage(data: string, format: string, x: number, y: number, w: number, h: number): void;
  output(type: "blob"): Blob;
}

async function addImagePage(pdf: PdfCanvas, file: File, isFirst: boolean): Promise<void> {
  const dataUrl = await readFileAsDataUrl(file);
  await loadImage(dataUrl);
  if (!isFirst) pdf.addPage();

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;

  const props = pdf.getImageProperties(dataUrl);
  const ratio = Math.min(maxW / props.width, maxH / props.height);
  const w = props.width * ratio;
  const h = props.height * ratio;
  const x = (pageW - w) / 2;
  const y = (pageH - h) / 2;
  const format = file.type.includes("png") ? "PNG" : "JPEG";
  pdf.addImage(dataUrl, format, x, y, w, h);
}

async function createA4Pdf(): Promise<PdfCanvas> {
  const { jsPDF } = await import("jspdf");
  return new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" }) as unknown as PdfCanvas;
}

/** Fit a card photo onto A4 and return a single-page PDF blob. */
export async function imageFileToPdfBlob(file: File): Promise<Blob> {
  const pdf = await createA4Pdf();
  await addImagePage(pdf, file, true);
  return pdf.output("blob");
}

/** Front + back on separate pages in one PDF. */
export async function imageFilesToCombinedPdfBlob(files: File[]): Promise<Blob> {
  if (files.length === 0) throw new Error("no images");
  const pdf = await createA4Pdf();
  for (let i = 0; i < files.length; i++) {
    await addImagePage(pdf, files[i]!, i === 0);
  }
  return pdf.output("blob");
}
