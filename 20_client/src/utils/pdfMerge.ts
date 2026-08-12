/** Merge multiple PDF blobs into one multi-page PDF. */
export async function mergePdfBlobs(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 0) throw new Error("no PDFs to merge");
  if (blobs.length === 1) return blobs[0]!;
  const { PDFDocument } = await import("pdf-lib");
  const merged = await PDFDocument.create();
  for (const blob of blobs) {
    const src = await PDFDocument.load(await blob.arrayBuffer());
    const pages = await merged.copyPages(src, src.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }
  const bytes = await merged.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}
