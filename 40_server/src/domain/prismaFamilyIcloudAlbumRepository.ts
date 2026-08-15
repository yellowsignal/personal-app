import type { PrismaClient } from "@prisma/client";
import type {
  FamilyIcloudAlbumCreate,
  FamilyIcloudAlbumPatch,
  FamilyIcloudAlbumRecord,
  FamilyIcloudAlbumRepository,
} from "./familyIcloudAlbumRepository.js";

function mapRow(row: {
  id: number;
  familyId: number;
  url: string;
  name: string | null;
  nameLocked: boolean;
  coverPhotoId: string | null;
  coverMime: string | null;
  photoCount: number | null;
  syncedAt: Date | null;
  createdAt: Date;
}): FamilyIcloudAlbumRecord {
  return {
    id: row.id,
    familyId: row.familyId,
    url: row.url,
    name: row.name,
    nameLocked: row.nameLocked,
    coverPhotoId: row.coverPhotoId,
    coverMime: row.coverMime,
    photoCount: row.photoCount,
    syncedAt: row.syncedAt,
    createdAt: row.createdAt,
  };
}

export class PrismaFamilyIcloudAlbumRepository implements FamilyIcloudAlbumRepository {
  constructor(private readonly db: PrismaClient) {}

  async listByFamily(familyId: number): Promise<FamilyIcloudAlbumRecord[]> {
    const rows = await this.db.familyIcloudAlbum.findMany({
      where: { familyId },
      orderBy: { id: "asc" },
    });
    return rows.map(mapRow);
  }

  async findById(id: number): Promise<FamilyIcloudAlbumRecord | null> {
    const row = await this.db.familyIcloudAlbum.findUnique({ where: { id } });
    return row ? mapRow(row) : null;
  }

  async create(input: FamilyIcloudAlbumCreate): Promise<FamilyIcloudAlbumRecord> {
    const row = await this.db.familyIcloudAlbum.create({
      data: {
        familyId: input.familyId,
        url: input.url,
        name: input.name,
        nameLocked: input.nameLocked ?? false,
        coverPhotoId: input.coverPhotoId ?? null,
        coverMime: input.coverMime ?? null,
        photoCount: input.photoCount ?? null,
        syncedAt: input.syncedAt ?? null,
      },
    });
    return mapRow(row);
  }

  async update(id: number, input: FamilyIcloudAlbumPatch): Promise<FamilyIcloudAlbumRecord> {
    const row = await this.db.familyIcloudAlbum.update({
      where: { id },
      data: {
        ...(input.url != null ? { url: input.url } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.nameLocked !== undefined ? { nameLocked: input.nameLocked } : {}),
        ...(input.coverPhotoId !== undefined ? { coverPhotoId: input.coverPhotoId } : {}),
        ...(input.coverMime !== undefined ? { coverMime: input.coverMime } : {}),
        ...(input.photoCount !== undefined ? { photoCount: input.photoCount } : {}),
        ...(input.syncedAt !== undefined ? { syncedAt: input.syncedAt } : {}),
      },
    });
    return mapRow(row);
  }

  async remove(id: number): Promise<boolean> {
    try {
      await this.db.familyIcloudAlbum.delete({ where: { id } });
      return true;
    } catch (err) {
      if ((err as { code?: string }).code === "P2025") return false;
      throw err;
    }
  }
}
