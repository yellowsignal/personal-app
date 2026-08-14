export interface PhotoRecord {
  id: number;
  userId: number;
  familyId: number | null;
  photoUrl: string;
  icloudAssetId: string | null;
  caption: string | null;
  isShared: boolean;
  createdAt: Date;
}

export interface PublicPhoto {
  id: number;
  userId: number;
  familyId: number | null;
  caption: string | null;
  isShared: boolean;
  createdAt: string;
  ownerName: string;
  editable: boolean;
  fileUrl: string;
}

export function toPublicPhoto(record: PhotoRecord, ownerName: string, viewerUserId: number): PublicPhoto {
  return {
    id: record.id,
    userId: record.userId,
    familyId: record.familyId,
    caption: record.caption,
    isShared: record.isShared,
    createdAt: record.createdAt.toISOString(),
    ownerName,
    editable: record.userId === viewerUserId,
    fileUrl: `/api/photos/${record.id}/file`,
  };
}
