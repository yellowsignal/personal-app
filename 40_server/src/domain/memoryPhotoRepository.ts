import type { PhotoRepository, CreatePhotoInput, UpdatePhotoInput } from "./photoRepository.js";
import type { PhotoRecord } from "./photoTypes.js";

export class MemoryPhotoRepository implements PhotoRepository {
  private rows = new Map<number, PhotoRecord>();
  private nextId = 1;

  async findById(id: number): Promise<PhotoRecord | null> {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async listForUser(userId: number, familyId: number | null): Promise<PhotoRecord[]> {
    return [...this.rows.values()]
      .filter((p) => p.userId === userId || (familyId != null && p.familyId === familyId && p.isShared))
      .map((p) => ({ ...p }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async create(input: CreatePhotoInput): Promise<PhotoRecord> {
    const record: PhotoRecord = {
      id: this.nextId++,
      userId: input.userId,
      familyId: input.familyId,
      photoUrl: input.photoUrl,
      icloudAssetId: input.icloudAssetId ?? null,
      caption: input.caption,
      isShared: input.isShared,
      createdAt: new Date(),
    };
    this.rows.set(record.id, record);
    return { ...record };
  }

  async update(id: number, input: UpdatePhotoInput): Promise<PhotoRecord> {
    const existing = this.rows.get(id);
    if (!existing) throw Object.assign(new Error("photo not found"), { code: "NOT_FOUND" });
    const updated: PhotoRecord = {
      ...existing,
      caption: input.caption === undefined ? existing.caption : input.caption,
      isShared: input.isShared === undefined ? existing.isShared : input.isShared,
      familyId: input.familyId === undefined ? existing.familyId : input.familyId,
      photoUrl: input.photoUrl === undefined ? existing.photoUrl : input.photoUrl,
    };
    this.rows.set(id, updated);
    return { ...updated };
  }

  async remove(id: number): Promise<boolean> {
    return this.rows.delete(id);
  }
}
