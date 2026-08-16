import type { PrismaClient, VaultCategory as PrismaVaultCategory } from "@prisma/client";
import type {
  CreateVaultItemInput,
  UpdateVaultItemInput,
  VaultCategory,
  VaultItemRecord,
  VaultItemRepository,
} from "./vaultTypes.js";

function mapRow(row: {
  id: number;
  userId: number;
  title: string;
  category: PrismaVaultCategory;
  url: string | null;
  loginId: string | null;
  secretCipher: string | null;
  memo: string | null;
  createdAt: Date;
  updatedAt: Date;
}): VaultItemRecord {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    category: row.category as VaultCategory,
    url: row.url,
    loginId: row.loginId,
    secretCipher: row.secretCipher,
    memo: row.memo,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaVaultItemRepository implements VaultItemRepository {
  constructor(private readonly db: PrismaClient) {}

  async listForUser(userId: number): Promise<VaultItemRecord[]> {
    const rows = await this.db.vaultItem.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(mapRow);
  }

  async findById(id: number): Promise<VaultItemRecord | null> {
    const row = await this.db.vaultItem.findUnique({ where: { id } });
    return row ? mapRow(row) : null;
  }

  async create(input: CreateVaultItemInput): Promise<VaultItemRecord> {
    const row = await this.db.vaultItem.create({
      data: {
        userId: input.userId,
        title: input.title,
        category: input.category,
        url: input.url,
        loginId: input.loginId,
        secretCipher: input.secretCipher,
        memo: input.memo,
      },
    });
    return mapRow(row);
  }

  async update(id: number, input: UpdateVaultItemInput): Promise<VaultItemRecord> {
    const row = await this.db.vaultItem.update({
      where: { id },
      data: {
        title: input.title,
        category: input.category,
        url: input.url,
        loginId: input.loginId,
        secretCipher: input.secretCipher,
        memo: input.memo,
      },
    });
    return mapRow(row);
  }

  async remove(id: number): Promise<void> {
    await this.db.vaultItem.delete({ where: { id } });
  }
}
