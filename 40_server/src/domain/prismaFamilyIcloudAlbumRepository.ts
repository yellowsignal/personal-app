import type { PrismaClient } from "@prisma/client";
import type {
  FamilyIcloudAlbumRecord,
  FamilyIcloudAlbumRepository,
} from "./familyIcloudAlbumRepository.js";

function mapRow(row: {
  id: number;
  familyId: number;
  url: string;
  name: string | null;
  createdAt: Date;
}): FamilyIcloudAlbumRecord {
  return {
    id: row.id,
    familyId: row.familyId,
    url: row.url,
    name: row.name,
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

  async create(input: { familyId: number; url: string; name: string | null }): Promise<FamilyIcloudAlbumRecord> {
    const row = await this.db.familyIcloudAlbum.create({
      data: { familyId: input.familyId, url: input.url, name: input.name },
    });
    return mapRow(row);
  }

  async updateName(id: number, name: string | null): Promise<FamilyIcloudAlbumRecord> {
    const row = await this.db.familyIcloudAlbum.update({
      where: { id },
      data: { name },
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
