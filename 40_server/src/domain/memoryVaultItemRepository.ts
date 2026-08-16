import type {
  CreateVaultItemInput,
  UpdateVaultItemInput,
  VaultItemRecord,
  VaultItemRepository,
} from "./vaultTypes.js";

export class MemoryVaultItemRepository implements VaultItemRepository {
  private nextId = 1;
  private rows: VaultItemRecord[] = [];

  async listForUser(userId: number): Promise<VaultItemRecord[]> {
    return this.rows
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((r) => ({ ...r }));
  }

  async findById(id: number): Promise<VaultItemRecord | null> {
    const row = this.rows.find((r) => r.id === id);
    return row ? { ...row } : null;
  }

  async create(input: CreateVaultItemInput): Promise<VaultItemRecord> {
    const now = new Date();
    const row: VaultItemRecord = {
      id: this.nextId++,
      userId: input.userId,
      title: input.title,
      category: input.category,
      url: input.url,
      loginId: input.loginId,
      secretCipher: input.secretCipher,
      memo: input.memo,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(row);
    return { ...row };
  }

  async update(id: number, input: UpdateVaultItemInput): Promise<VaultItemRecord> {
    const idx = this.rows.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error("vault item not found");
    const existing = this.rows[idx]!;
    const row: VaultItemRecord = {
      ...existing,
      title: input.title === undefined ? existing.title : input.title,
      category: input.category === undefined ? existing.category : input.category,
      url: input.url === undefined ? existing.url : input.url,
      loginId: input.loginId === undefined ? existing.loginId : input.loginId,
      secretCipher: input.secretCipher === undefined ? existing.secretCipher : input.secretCipher,
      memo: input.memo === undefined ? existing.memo : input.memo,
      updatedAt: new Date(),
    };
    this.rows[idx] = row;
    return { ...row };
  }

  async remove(id: number): Promise<void> {
    this.rows = this.rows.filter((r) => r.id !== id);
  }
}
