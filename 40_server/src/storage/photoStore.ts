import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heic",
  "image/heic-sequence": "heic",
};

const HEIC_BRANDS = new Set(["heic", "heif", "mif1", "msf1", "heix", "hevc", "heim", "heis"]);

export function photoExtForMime(mime: string): string {
  return MIME_EXT[mime.toLowerCase()] ?? "jpg";
}

export function normalizePhotoMime(raw: string | undefined): string | null {
  const mime = (raw ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (MIME_EXT[mime]) {
    if (mime === "image/jpg") return "image/jpeg";
    if (mime === "image/heif" || mime === "image/heic-sequence") return "image/heic";
    return mime;
  }
  return null;
}

/** iPhone file uploads often arrive as octet-stream with an empty type. */
export function sniffPhotoMime(bytes: Buffer, declared?: string): string | null {
  const fromHeader = normalizePhotoMime(declared);
  if (fromHeader) return fromHeader;
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp") {
    const brand = bytes.toString("ascii", 8, 12).toLowerCase();
    if (HEIC_BRANDS.has(brand)) return "image/heic";
  }
  return null;
}

export class PhotoStore {
  constructor(private readonly baseDir: string) {}

  private filePath(id: number): string {
    return path.join(this.baseDir, String(id));
  }

  private mimePath(id: number): string {
    return path.join(this.baseDir, `${id}.mime`);
  }

  async ensureDir(): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
  }

  async save(id: number, bytes: Buffer, mime: string): Promise<void> {
    await this.ensureDir();
    await writeFile(this.filePath(id), bytes);
    await writeFile(this.mimePath(id), mime, "utf8");
  }

  async read(id: number): Promise<{ bytes: Buffer; mime: string } | null> {
    try {
      const bytes = await readFile(this.filePath(id));
      let mime = "image/jpeg";
      try {
        mime = (await readFile(this.mimePath(id), "utf8")).trim() || mime;
      } catch {
        /* default jpeg */
      }
      return { bytes, mime };
    } catch {
      return null;
    }
  }

  async remove(id: number): Promise<void> {
    for (const p of [this.filePath(id), this.mimePath(id)]) {
      try {
        await unlink(p);
      } catch {
        /* ignore */
      }
    }
  }
}

export function defaultPhotoDir(): string {
  if (process.env.PHOTO_DIR) return process.env.PHOTO_DIR;
  return path.resolve(process.cwd(), "../30_data/photos");
}
