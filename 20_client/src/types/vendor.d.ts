declare module "jspdf" {
  export class jsPDF {
    constructor(options?: { orientation?: string; unit?: string; format?: string });
    addPage(): void;
    internal: { pageSize: { getWidth(): number; getHeight(): number } };
    getImageProperties(src: string): { width: number; height: number };
    addImage(data: string, format: string, x: number, y: number, w: number, h: number): void;
    output(type: "blob"): Blob;
  }
}

declare module "pdf-lib" {
  export class PDFDocument {
    static create(): Promise<PDFDocument>;
    static load(data: ArrayBuffer | Uint8Array): Promise<PDFDocument>;
    getPageIndices(): number[];
    copyPages(src: PDFDocument, indices: number[]): Promise<unknown[]>;
    addPage(page: unknown): void;
    save(): Promise<Uint8Array>;
  }
}

declare module "tesseract.js" {
  export function createWorker(
    langs?: string,
    oem?: number,
    options?: {
      logger?: (message: { status?: string; progress?: number }) => void;
    },
  ): Promise<{
    recognize(image: Blob | File): Promise<{ data: { text: string } }>;
    terminate(): Promise<void>;
  }>;
}
