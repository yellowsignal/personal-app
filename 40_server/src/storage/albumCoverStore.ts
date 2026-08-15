import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/** Persists album cover JPEGs/PNGs keyed by FamilyIcloudAlbum id. */
export class AlbumCoverStore {
  constructor(private readonly baseDir: string) {}

  private filePath(albumId: number): string {
    return path.join(this.baseDir, String(albumId));
  }

  private mimePath(albumId: number): string {
    return path.join(this.baseDir, `${albumId}.mime`);
  }

  async ensureDir(): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
  }

  async save(albumId: number, bytes: Buffer, mime: string): Promise<void> {
    await this.ensureDir();
    await writeFile(this.filePath(albumId), bytes);
    await writeFile(this.mimePath(albumId), mime, "utf8");
  }

  async read(albumId: number): Promise<{ bytes: Buffer; mime: string } | null> {
    try {
      const bytes = await readFile(this.filePath(albumId));
      let mime = "image/jpeg";
      try {
        mime = (await readFile(this.mimePath(albumId), "utf8")).trim() || mime;
      } catch {
        /* default */
      }
      return { bytes, mime };
    } catch {
      return null;
    }
  }

  async remove(albumId: number): Promise<void> {
    for (const p of [this.filePath(albumId), this.mimePath(albumId)]) {
      try {
        await unlink(p);
      } catch {
        /* ignore */
      }
    }
  }
}

export function defaultAlbumCoverDir(): string {
  if (process.env.ICLOUD_COVER_DIR) return process.env.ICLOUD_COVER_DIR;
  return path.resolve(process.cwd(), "../30_data/icloud-covers");
}
