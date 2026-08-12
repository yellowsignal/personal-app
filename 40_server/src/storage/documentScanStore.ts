import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export type ScanSide = "front" | "back";

export class DocumentScanStore {
  constructor(private readonly baseDir: string) {}

  private sidePath(documentId: number, side: ScanSide): string {
    return path.join(this.baseDir, `${documentId}-${side}.pdf`);
  }

  /** Legacy single-file path before front/back support */
  private legacyPath(documentId: number): string {
    return path.join(this.baseDir, `${documentId}.pdf`);
  }

  async ensureDir(): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
  }

  async saveSide(documentId: number, side: ScanSide, pdf: Buffer): Promise<void> {
    await this.ensureDir();
    await writeFile(this.sidePath(documentId, side), pdf);
  }

  async readSide(documentId: number, side: ScanSide): Promise<Buffer | null> {
    try {
      return await readFile(this.sidePath(documentId, side));
    } catch {
      if (side === "front") {
        try {
          return await readFile(this.legacyPath(documentId));
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  async hasSide(documentId: number, side: ScanSide): Promise<boolean> {
    try {
      await access(this.sidePath(documentId, side));
      return true;
    } catch {
      if (side === "front") {
        try {
          await access(this.legacyPath(documentId));
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }

  async remove(documentId: number): Promise<void> {
    for (const side of ["front", "back"] as ScanSide[]) {
      try {
        await unlink(this.sidePath(documentId, side));
      } catch {
        /* ignore */
      }
    }
    try {
      await unlink(this.legacyPath(documentId));
    } catch {
      /* ignore */
    }
  }
}

export function defaultDocumentScanDir(): string {
  if (process.env.DOCUMENT_SCAN_DIR) {
    return process.env.DOCUMENT_SCAN_DIR;
  }
  return path.resolve(process.cwd(), "../30_data/document-scans");
}

/** DB imageUrl scan marker helpers */
export function scanMarkerFromSides(hasFront: boolean, hasBack: boolean): string | null {
  if (!hasFront) return null;
  return hasBack ? "scan:both" : "scan:front";
}

export function parseScanMarker(imageUrl: string | null): { hasScan: boolean; hasScanBack: boolean } {
  if (!imageUrl) return { hasScan: false, hasScanBack: false };
  if (imageUrl === "scan" || imageUrl === "scan:front") {
    return { hasScan: true, hasScanBack: false };
  }
  if (imageUrl === "scan:both") {
    return { hasScan: true, hasScanBack: true };
  }
  return { hasScan: false, hasScanBack: false };
}
