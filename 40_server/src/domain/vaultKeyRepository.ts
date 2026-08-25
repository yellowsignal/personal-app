export interface VaultKeyPackageRecord {
  userId: number;
  familyId: number | null;
  kdfSalt: string;
  kdfIterations: number;
  personalDekWrapped: string;
  privateKeyWrapped: string;
  publicKeyJwk: string;
  familyDekWrapped: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FamilyDekDeliveryRecord {
  id: number;
  familyId: number;
  toUserId: number;
  fromUserId: number;
  ciphertext: string;
  createdAt: Date;
}

export type UpsertVaultKeyPackageInput = {
  userId: number;
  familyId: number | null;
  kdfSalt: string;
  kdfIterations: number;
  personalDekWrapped: string;
  privateKeyWrapped: string;
  publicKeyJwk: string;
  familyDekWrapped?: string | null;
};

export interface VaultKeyRepository {
  findByUserId(userId: number): Promise<VaultKeyPackageRecord | null>;
  listByFamilyId(familyId: number): Promise<VaultKeyPackageRecord[]>;
  upsert(input: UpsertVaultKeyPackageInput): Promise<VaultKeyPackageRecord>;
  setFamilyDekWrapped(userId: number, familyDekWrapped: string): Promise<VaultKeyPackageRecord>;
  upsertDelivery(input: {
    familyId: number;
    toUserId: number;
    fromUserId: number;
    ciphertext: string;
  }): Promise<FamilyDekDeliveryRecord>;
  findDeliveryForUser(toUserId: number): Promise<FamilyDekDeliveryRecord | null>;
  deleteDeliveryForUser(toUserId: number): Promise<void>;
}
