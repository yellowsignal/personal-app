import type { PhotoRecord } from "./photoTypes.js";

export interface CreatePhotoInput {
  userId: number;
  familyId: number | null;
  photoUrl: string;
  caption: string | null;
  isShared: boolean;
  icloudAssetId?: string | null;
}

export interface UpdatePhotoInput {
  caption?: string | null;
  isShared?: boolean;
  familyId?: number | null;
  photoUrl?: string;
}

export interface PhotoRepository {
  findById(id: number): Promise<PhotoRecord | null>;
  listForUser(userId: number, familyId: number | null): Promise<PhotoRecord[]>;
  create(input: CreatePhotoInput): Promise<PhotoRecord>;
  update(id: number, input: UpdatePhotoInput): Promise<PhotoRecord>;
  remove(id: number): Promise<boolean>;
}
