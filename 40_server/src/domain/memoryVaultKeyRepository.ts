import type {
  FamilyDekDeliveryRecord,
  UpsertVaultKeyPackageInput,
  VaultKeyPackageRecord,
  VaultKeyRepository,
} from "./vaultKeyRepository.js";

export class MemoryVaultKeyRepository implements VaultKeyRepository {
  private packages = new Map<number, VaultKeyPackageRecord>();
  private deliveries = new Map<number, FamilyDekDeliveryRecord>();
  private nextDeliveryId = 1;

  async findByUserId(userId: number): Promise<VaultKeyPackageRecord | null> {
    const row = this.packages.get(userId);
    return row ? { ...row } : null;
  }

  async listByFamilyId(familyId: number): Promise<VaultKeyPackageRecord[]> {
    return [...this.packages.values()]
      .filter((p) => p.familyId === familyId)
      .map((p) => ({ ...p }));
  }

  async upsert(input: UpsertVaultKeyPackageInput): Promise<VaultKeyPackageRecord> {
    const now = new Date();
    const existing = this.packages.get(input.userId);
    const row: VaultKeyPackageRecord = {
      userId: input.userId,
      familyId: input.familyId,
      kdfSalt: input.kdfSalt,
      kdfIterations: input.kdfIterations,
      personalDekWrapped: input.personalDekWrapped,
      privateKeyWrapped: input.privateKeyWrapped,
      publicKeyJwk: input.publicKeyJwk,
      familyDekWrapped:
        input.familyDekWrapped === undefined
          ? (existing?.familyDekWrapped ?? null)
          : input.familyDekWrapped,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.packages.set(input.userId, row);
    return { ...row };
  }

  async setFamilyDekWrapped(userId: number, familyDekWrapped: string): Promise<VaultKeyPackageRecord> {
    const existing = this.packages.get(userId);
    if (!existing) throw Object.assign(new Error("vault keys not found"), { code: "NOT_FOUND" });
    const row = { ...existing, familyDekWrapped, updatedAt: new Date() };
    this.packages.set(userId, row);
    return { ...row };
  }

  async upsertDelivery(input: {
    familyId: number;
    toUserId: number;
    fromUserId: number;
    ciphertext: string;
  }): Promise<FamilyDekDeliveryRecord> {
    const existing = this.deliveries.get(input.toUserId);
    const row: FamilyDekDeliveryRecord = {
      id: existing?.id ?? this.nextDeliveryId++,
      familyId: input.familyId,
      toUserId: input.toUserId,
      fromUserId: input.fromUserId,
      ciphertext: input.ciphertext,
      createdAt: existing?.createdAt ?? new Date(),
    };
    this.deliveries.set(input.toUserId, row);
    return { ...row };
  }

  async findDeliveryForUser(toUserId: number): Promise<FamilyDekDeliveryRecord | null> {
    const row = this.deliveries.get(toUserId);
    return row ? { ...row } : null;
  }

  async deleteDeliveryForUser(toUserId: number): Promise<void> {
    this.deliveries.delete(toUserId);
  }
}
