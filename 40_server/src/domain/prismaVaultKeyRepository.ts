import type { PrismaClient } from "@prisma/client";
import type {
  FamilyDekDeliveryRecord,
  UpsertVaultKeyPackageInput,
  VaultKeyPackageRecord,
  VaultKeyRepository,
} from "./vaultKeyRepository.js";

function mapPackage(row: {
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
}): VaultKeyPackageRecord {
  return { ...row };
}

function mapDelivery(row: {
  id: number;
  familyId: number;
  toUserId: number;
  fromUserId: number;
  ciphertext: string;
  createdAt: Date;
}): FamilyDekDeliveryRecord {
  return { ...row };
}

export class PrismaVaultKeyRepository implements VaultKeyRepository {
  constructor(private readonly db: PrismaClient) {}

  async findByUserId(userId: number): Promise<VaultKeyPackageRecord | null> {
    const row = await this.db.vaultKeyPackage.findUnique({ where: { userId } });
    return row ? mapPackage(row) : null;
  }

  async listByFamilyId(familyId: number): Promise<VaultKeyPackageRecord[]> {
    const rows = await this.db.vaultKeyPackage.findMany({ where: { familyId } });
    return rows.map(mapPackage);
  }

  async upsert(input: UpsertVaultKeyPackageInput): Promise<VaultKeyPackageRecord> {
    const row = await this.db.vaultKeyPackage.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        familyId: input.familyId,
        kdfSalt: input.kdfSalt,
        kdfIterations: input.kdfIterations,
        personalDekWrapped: input.personalDekWrapped,
        privateKeyWrapped: input.privateKeyWrapped,
        publicKeyJwk: input.publicKeyJwk,
        familyDekWrapped: input.familyDekWrapped ?? null,
      },
      update: {
        familyId: input.familyId,
        kdfSalt: input.kdfSalt,
        kdfIterations: input.kdfIterations,
        personalDekWrapped: input.personalDekWrapped,
        privateKeyWrapped: input.privateKeyWrapped,
        publicKeyJwk: input.publicKeyJwk,
        ...(input.familyDekWrapped !== undefined
          ? { familyDekWrapped: input.familyDekWrapped }
          : {}),
      },
    });
    return mapPackage(row);
  }

  async setFamilyDekWrapped(userId: number, familyDekWrapped: string): Promise<VaultKeyPackageRecord> {
    const row = await this.db.vaultKeyPackage.update({
      where: { userId },
      data: { familyDekWrapped },
    });
    return mapPackage(row);
  }

  async upsertDelivery(input: {
    familyId: number;
    toUserId: number;
    fromUserId: number;
    ciphertext: string;
  }): Promise<FamilyDekDeliveryRecord> {
    const row = await this.db.familyDekDelivery.upsert({
      where: { toUserId: input.toUserId },
      create: input,
      update: {
        familyId: input.familyId,
        fromUserId: input.fromUserId,
        ciphertext: input.ciphertext,
      },
    });
    return mapDelivery(row);
  }

  async findDeliveryForUser(toUserId: number): Promise<FamilyDekDeliveryRecord | null> {
    const row = await this.db.familyDekDelivery.findUnique({ where: { toUserId } });
    return row ? mapDelivery(row) : null;
  }

  async deleteDeliveryForUser(toUserId: number): Promise<void> {
    await this.db.familyDekDelivery.deleteMany({ where: { toUserId } });
  }
}
