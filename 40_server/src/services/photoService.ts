import type { AuthRepository } from "../domain/authRepository.js";
import type { PhotoRepository } from "../domain/photoRepository.js";
import { toPublicPhoto, type PublicPhoto } from "../domain/photoTypes.js";
import type { PhotoStore } from "../storage/photoStore.js";
import { sniffPhotoMime } from "../storage/photoStore.js";
import { HttpError } from "./authService.js";
import type { FamilyActivityService } from "./familyActivityService.js";

const MAX_BYTES = 12 * 1024 * 1024;

export class PhotoService {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly photoRepo: PhotoRepository,
    private readonly store: PhotoStore,
    private readonly activityService: FamilyActivityService | null = null,
  ) {}

  private async requireUser(userId: number) {
    const user = await this.authRepo.findUserById(userId);
    if (!user) throw new HttpError(401, "unauthorized", "UNAUTHORIZED");
    return user;
  }

  private async ownerName(userId: number): Promise<string> {
    const owner = await this.authRepo.findUserById(userId);
    return owner?.name ?? "Unknown";
  }

  private canView(
    record: { userId: number; isShared: boolean; familyId: number | null },
    user: { id: number; familyId: number | null },
  ): boolean {
    if (record.userId === user.id) return true;
    return Boolean(record.isShared && user.familyId && record.familyId === user.familyId);
  }

  async list(userId: number): Promise<PublicPhoto[]> {
    const user = await this.requireUser(userId);
    const rows = await this.photoRepo.listForUser(user.id, user.familyId);
    const out: PublicPhoto[] = [];
    for (const row of rows.filter((p) => p.isShared)) {
      out.push(toPublicPhoto(row, await this.ownerName(row.userId), user.id));
    }
    return out;
  }

  async create(
    userId: number,
    body: { caption?: unknown; isShared?: unknown },
    file: { bytes: Buffer; mime: string | undefined },
  ): Promise<PublicPhoto> {
    const user = await this.requireUser(userId);
    if (!user.familyId) throw new HttpError(400, "join a family before adding photos", "NO_FAMILY");
    if (!file.bytes.length) throw new HttpError(400, "image is required");
    if (file.bytes.length > MAX_BYTES) throw new HttpError(400, "image is too large (max 12MB)");
    const mime = sniffPhotoMime(file.bytes, file.mime);
    if (!mime) throw new HttpError(400, "image must be jpeg, png, webp, or heic");

    const caption =
      typeof body.caption === "string" ? body.caption.trim().slice(0, 200) || null : null;

    const record = await this.photoRepo.create({
      userId: user.id,
      familyId: user.familyId,
      photoUrl: "",
      caption,
      isShared: true,
    });
    try {
      await this.store.save(record.id, file.bytes, mime);
    } catch (err) {
      await this.photoRepo.remove(record.id);
      throw err;
    }
    const saved = await this.photoRepo.update(record.id, {
      photoUrl: `/api/photos/${record.id}/file`,
    });

    try {
      await this.activityService?.recordSharedCreate({
        familyId: saved.familyId,
        actorUserId: user.id,
        actorName: user.name,
        entityType: "PHOTO",
        entityId: saved.id,
        title: caption || "photo",
      });
    } catch (err) {
      console.error("[photos] family activity after create failed", err);
    }
    return toPublicPhoto(saved, user.name, user.id);
  }

  async update(userId: number, id: number, body: Record<string, unknown>): Promise<PublicPhoto> {
    const user = await this.requireUser(userId);
    const existing = await this.photoRepo.findById(id);
    if (!existing) throw new HttpError(404, "photo not found", "NOT_FOUND");
    if (existing.userId !== user.id) throw new HttpError(403, "only the owner can edit this photo", "FORBIDDEN");

    const updated = await this.photoRepo.update(id, {
      caption:
        body.caption === undefined
          ? undefined
          : typeof body.caption === "string"
            ? body.caption.trim().slice(0, 200) || null
            : null,
      isShared: true,
      familyId: user.familyId ?? existing.familyId,
    });
    return toPublicPhoto(updated, user.name, user.id);
  }

  async remove(userId: number, id: number): Promise<void> {
    const user = await this.requireUser(userId);
    const existing = await this.photoRepo.findById(id);
    if (!existing) throw new HttpError(404, "photo not found", "NOT_FOUND");
    if (existing.userId !== user.id) throw new HttpError(403, "only the owner can delete this photo", "FORBIDDEN");
    await this.store.remove(id);
    await this.photoRepo.remove(id);
  }

  async readFile(userId: number, id: number): Promise<{ bytes: Buffer; mime: string }> {
    const user = await this.requireUser(userId);
    const existing = await this.photoRepo.findById(id);
    if (!existing) throw new HttpError(404, "photo not found", "NOT_FOUND");
    if (!this.canView(existing, user)) throw new HttpError(403, "forbidden", "FORBIDDEN");
    const file = await this.store.read(id);
    if (!file) throw new HttpError(404, "photo file missing", "NOT_FOUND");
    return file;
  }
}
