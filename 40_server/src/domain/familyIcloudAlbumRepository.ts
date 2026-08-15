export interface FamilyIcloudAlbumRecord {
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
}

export type FamilyIcloudAlbumCreate = {
  familyId: number;
  url: string;
  name: string | null;
  nameLocked?: boolean;
  coverPhotoId?: string | null;
  coverMime?: string | null;
  photoCount?: number | null;
  syncedAt?: Date | null;
};

export type FamilyIcloudAlbumPatch = {
  url?: string;
  name?: string | null;
  nameLocked?: boolean;
  coverPhotoId?: string | null;
  coverMime?: string | null;
  photoCount?: number | null;
  syncedAt?: Date | null;
};

export interface FamilyIcloudAlbumRepository {
  listByFamily(familyId: number): Promise<FamilyIcloudAlbumRecord[]>;
  findById(id: number): Promise<FamilyIcloudAlbumRecord | null>;
  create(input: FamilyIcloudAlbumCreate): Promise<FamilyIcloudAlbumRecord>;
  update(id: number, input: FamilyIcloudAlbumPatch): Promise<FamilyIcloudAlbumRecord>;
  remove(id: number): Promise<boolean>;
}
