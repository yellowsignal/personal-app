import { jsPDF } from "jspdf";

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

/** Fit a card photo onto A4 and return a PDF blob for storage/printing. */
export async function imageFileToPdfBlob(file: File): Promise<Blob> {
  const dataUrl = await readFileAsDataUrl(file);
  await loadImage(dataUrl);

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
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
  return pdf.output("blob");
}
