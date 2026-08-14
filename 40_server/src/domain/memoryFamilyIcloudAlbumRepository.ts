import type {
  FamilyIcloudAlbumRecord,
  FamilyIcloudAlbumRepository,
} from "./familyIcloudAlbumRepository.js";

export class MemoryFamilyIcloudAlbumRepository implements FamilyIcloudAlbumRepository {
  private rows = new Map<number, FamilyIcloudAlbumRecord>();
  private nextId = 1;

  async listByFamily(familyId: number): Promise<FamilyIcloudAlbumRecord[]> {
    return [...this.rows.values()]
      .filter((row) => row.familyId === familyId)
      .sort((a, b) => a.id - b.id)
      .map((row) => ({ ...row }));
  }

  async findById(id: number): Promise<FamilyIcloudAlbumRecord | null> {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async create(input: { familyId: number; url: string; name: string | null }): Promise<FamilyIcloudAlbumRecord> {
    const record: FamilyIcloudAlbumRecord = {
      id: this.nextId++,
      familyId: input.familyId,
      url: input.url,
      name: input.name,
      createdAt: new Date(),
    };
    this.rows.set(record.id, record);
    return { ...record };
  }

  async update(
    id: number,
    input: { url?: string; name?: string | null },
  ): Promise<FamilyIcloudAlbumRecord> {
    const existing = this.rows.get(id);
    if (!existing) throw Object.assign(new Error("album not found"), { code: "NOT_FOUND" });
    if (input.url && input.url !== existing.url) {
      const dup = [...this.rows.values()].some(
        (row) => row.familyId === existing.familyId && row.url === input.url && row.id !== id,
      );
      if (dup) throw Object.assign(new Error("album exists"), { code: "ALBUM_EXISTS" });
    }
    const updated: FamilyIcloudAlbumRecord = {
      ...existing,
      url: input.url ?? existing.url,
      name: input.name !== undefined ? input.name : existing.name,
    };
    this.rows.set(id, updated);
    return { ...updated };
  }

  async updateName(id: number, name: string | null): Promise<FamilyIcloudAlbumRecord> {
    const existing = this.rows.get(id);
    if (!existing) throw Object.assign(new Error("album not found"), { code: "NOT_FOUND" });
    const updated = { ...existing, name };
    this.rows.set(id, updated);
    return { ...updated };
  }

  async remove(id: number): Promise<boolean> {
    return this.rows.delete(id);
  }
}
