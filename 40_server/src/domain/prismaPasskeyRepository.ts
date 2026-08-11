import type { PrismaClient } from "@prisma/client";
import type {
  CreatePasskeyInput,
  InviteTokenRecord,
  InviteTokenRepository,
  PasskeyCredentialRecord,
  PasskeyRepository,
} from "./passkeyTypes.js";

function mapPasskey(row: {
  id: string;
  userId: number;
  publicKey: Buffer;
  counter: bigint;
  deviceType: string | null;
  backedUp: boolean;
  transports: string | null;
  createdAt: Date;
}): PasskeyCredentialRecord {
  return {
    id: row.id,
    userId: row.userId,
    publicKey: new Uint8Array(row.publicKey),
    counter: Number(row.counter),
    deviceType: row.deviceType,
    backedUp: row.backedUp,
    transports: row.transports ? (JSON.parse(row.transports) as string[]) : null,
    createdAt: row.createdAt,
  };
}

function mapInvite(row: {
  id: number;
  familyId: number;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  usedByUserId: number | null;
  createdByUserId: number;
  createdAt: Date;
}): InviteTokenRecord {
  return { ...row };
}

export class PrismaPasskeyRepository implements PasskeyRepository {
  constructor(private readonly db: PrismaClient) {}

  async findByCredentialId(id: string): Promise<PasskeyCredentialRecord | null> {
    const row = await this.db.passkeyCredential.findUnique({ where: { id } });
    return row ? mapPasskey(row) : null;
  }

  async listByUserId(userId: number): Promise<PasskeyCredentialRecord[]> {
    const rows = await this.db.passkeyCredential.findMany({ where: { userId } });
    return rows.map(mapPasskey);
  }

  async create(input: CreatePasskeyInput): Promise<PasskeyCredentialRecord> {
    const row = await this.db.passkeyCredential.create({
      data: {
        id: input.id,
        userId: input.userId,
        publicKey: Buffer.from(input.publicKey),
        counter: BigInt(input.counter),
        deviceType: input.deviceType,
        backedUp: input.backedUp,
        transports: input.transports ? JSON.stringify(input.transports) : null,
      },
    });
    return mapPasskey(row);
  }

  async updateCounter(id: string, counter: number): Promise<void> {
    await this.db.passkeyCredential.update({
      where: { id },
      data: { counter: BigInt(counter) },
    });
  }
}

export class PrismaInviteTokenRepository implements InviteTokenRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(input: {
    familyId: number;
    tokenHash: string;
    expiresAt: Date;
    createdByUserId: number;
  }): Promise<InviteTokenRecord> {
    const row = await this.db.inviteToken.create({ data: input });
    return mapInvite(row);
  }

  async findByTokenHash(tokenHash: string): Promise<InviteTokenRecord | null> {
    const row = await this.db.inviteToken.findUnique({ where: { tokenHash } });
    return row ? mapInvite(row) : null;
  }

  async markUsed(id: number, usedByUserId: number): Promise<InviteTokenRecord> {
    const row = await this.db.inviteToken.update({
      where: { id },
      data: { usedAt: new Date(), usedByUserId },
    });
    return mapInvite(row);
  }
}
