import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export class DocumentScanStore {
  constructor(private readonly baseDir: string) {}

  private scanPath(documentId: number): string {
    return path.join(this.baseDir, `${documentId}.pdf`);
  }

  async ensureDir(): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
  }

  async save(documentId: number, pdf: Buffer): Promise<void> {
    await this.ensureDir();
    await writeFile(this.scanPath(documentId), pdf);
  }

  async read(documentId: number): Promise<Buffer | null> {
    try {
      return await readFile(this.scanPath(documentId));
    } catch {
      return null;
    }
  }

  async remove(documentId: number): Promise<void> {
    try {
      await unlink(this.scanPath(documentId));
    } catch {
      /* ignore missing file */
    }
  }

  async exists(documentId: number): Promise<boolean> {
    try {
      await access(this.scanPath(documentId));
      return true;
    } catch {
      return false;
    }
  }
}

export function defaultDocumentScanDir(): string {
  if (process.env.DOCUMENT_SCAN_DIR) {
    return process.env.DOCUMENT_SCAN_DIR;
  }
  return path.resolve(process.cwd(), "../30_data/document-scans");
}
