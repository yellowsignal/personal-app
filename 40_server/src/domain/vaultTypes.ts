export type VaultCategory = "LOGIN" | "PRODUCT_KEY" | "OTHER";

export interface VaultItemRecord {
  id: number;
  userId: number;
  title: string;
  category: VaultCategory;
  url: string | null;
  loginId: string | null;
  secretCipher: string | null;
  memo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateVaultItemInput {
  userId: number;
  title: string;
  category: VaultCategory;
  url: string | null;
  loginId: string | null;
  secretCipher: string | null;
  memo: string | null;
}

export interface UpdateVaultItemInput {
  title?: string;
  category?: VaultCategory;
  url?: string | null;
  loginId?: string | null;
  /** undefined = keep; null = clear */
  secretCipher?: string | null;
  memo?: string | null;
}

export interface PublicVaultItem {
  id: number;
  title: string;
  category: VaultCategory;
  url: string | null;
  memo: string | null;
  hasLoginId: boolean;
  hasSecret: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toPublicVaultItem(row: VaultItemRecord): PublicVaultItem {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    url: row.url,
    memo: row.memo,
    hasLoginId: Boolean(row.loginId),
    hasSecret: Boolean(row.secretCipher),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface VaultItemRepository {
  listForUser(userId: number): Promise<VaultItemRecord[]>;
  findById(id: number): Promise<VaultItemRecord | null>;
  create(input: CreateVaultItemInput): Promise<VaultItemRecord>;
  update(id: number, input: UpdateVaultItemInput): Promise<VaultItemRecord>;
  remove(id: number): Promise<void>;
}
