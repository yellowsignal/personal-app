import type { PrismaClient, Photo as PrismaPhoto } from "@prisma/client";
import type { PhotoRepository, CreatePhotoInput, UpdatePhotoInput } from "./photoRepository.js";
import type { PhotoRecord } from "./photoTypes.js";

function map(row: PrismaPhoto): PhotoRecord {
  return {
    id: row.id,
    userId: row.userId,
    familyId: row.familyId,
    photoUrl: row.photoUrl,
    icloudAssetId: row.icloudAssetId,
    caption: row.caption,
    isShared: row.isShared,
    createdAt: row.createdAt,
  };
}

export class PrismaPhotoRepository implements PhotoRepository {
  constructor(private readonly db: PrismaClient) {}

  async findById(id: number): Promise<PhotoRecord | null> {
    const row = await this.db.photo.findUnique({ where: { id } });
    return row ? map(row) : null;
  }

  async listForUser(userId: number, familyId: number | null): Promise<PhotoRecord[]> {
    const rows = await this.db.photo.findMany({
      where: familyId
        ? { OR: [{ userId }, { familyId, isShared: true }] }
        : { userId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(map);
  }

  async create(input: CreatePhotoInput): Promise<PhotoRecord> {
    const row = await this.db.photo.create({
      data: {
        userId: input.userId,
        familyId: input.familyId,
        photoUrl: input.photoUrl,
        caption: input.caption,
        isShared: input.isShared,
        icloudAssetId: input.icloudAssetId ?? null,
      },
    });
    return map(row);
  }

  async update(id: number, input: UpdatePhotoInput): Promise<PhotoRecord> {
    const row = await this.db.photo.update({
      where: { id },
      data: {
        caption: input.caption,
        isShared: input.isShared,
        familyId: input.familyId,
        photoUrl: input.photoUrl,
      },
    });
    return map(row);
  }

  async remove(id: number): Promise<boolean> {
    try {
      await this.db.photo.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }
}
