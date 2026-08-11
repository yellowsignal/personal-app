export interface PasskeyCredentialRecord {
  id: string;
  userId: number;
  publicKey: Uint8Array;
  counter: number;
  deviceType: string | null;
  backedUp: boolean;
  transports: string[] | null;
  createdAt: Date;
}

export interface InviteTokenRecord {
  id: number;
  familyId: number;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  usedByUserId: number | null;
  createdByUserId: number;
  createdAt: Date;
}

export interface CreatePasskeyInput {
  id: string;
  userId: number;
  publicKey: Uint8Array;
  counter: number;
  deviceType: string | null;
  backedUp: boolean;
  transports: string[] | null;
}

export interface PasskeyRepository {
  findByCredentialId(id: string): Promise<PasskeyCredentialRecord | null>;
  listByUserId(userId: number): Promise<PasskeyCredentialRecord[]>;
  create(input: CreatePasskeyInput): Promise<PasskeyCredentialRecord>;
  updateCounter(id: string, counter: number): Promise<void>;
}

export interface InviteTokenRepository {
  create(input: {
    familyId: number;
    tokenHash: string;
    expiresAt: Date;
    createdByUserId: number;
  }): Promise<InviteTokenRecord>;
  findByTokenHash(tokenHash: string): Promise<InviteTokenRecord | null>;
  markUsed(id: number, usedByUserId: number): Promise<InviteTokenRecord>;
}
