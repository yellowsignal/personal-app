export interface FamilyIcloudAlbumRecord {
  id: number;
  familyId: number;
  url: string;
  name: string | null;
  createdAt: Date;
}

export interface FamilyIcloudAlbumRepository {
  listByFamily(familyId: number): Promise<FamilyIcloudAlbumRecord[]>;
  findById(id: number): Promise<FamilyIcloudAlbumRecord | null>;
  create(input: { familyId: number; url: string; name: string | null }): Promise<FamilyIcloudAlbumRecord>;
  updateName(id: number, name: string | null): Promise<FamilyIcloudAlbumRecord>;
  remove(id: number): Promise<boolean>;
}
