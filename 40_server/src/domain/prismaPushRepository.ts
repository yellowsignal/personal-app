import type { PrismaClient, PushSubscription as PrismaRow } from "@prisma/client";
import type { PushRepository, PushSubscriptionRecord, UpsertPushSubscriptionInput } from "./pushRepository.js";

function map(row: PrismaRow): PushSubscriptionRecord {
  return {
    id: row.id,
    userId: row.userId,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PrismaPushRepository implements PushRepository {
  constructor(private readonly db: PrismaClient) {}

  async upsert(input: UpsertPushSubscriptionInput): Promise<PushSubscriptionRecord> {
    const row = await this.db.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId: input.userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent,
      },
      update: {
        userId: input.userId,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent,
      },
    });
    return map(row);
  }

  async listForUser(userId: number): Promise<PushSubscriptionRecord[]> {
    const rows = await this.db.pushSubscription.findMany({ where: { userId } });
    return rows.map(map);
  }

  async listForUsers(userIds: number[]): Promise<PushSubscriptionRecord[]> {
    if (userIds.length === 0) return [];
    const rows = await this.db.pushSubscription.findMany({ where: { userId: { in: userIds } } });
    return rows.map(map);
  }

  async removeByEndpoint(endpoint: string): Promise<boolean> {
    try {
      await this.db.pushSubscription.delete({ where: { endpoint } });
      return true;
    } catch {
      return false;
    }
  }

  async removeForUserEndpoint(userId: number, endpoint: string): Promise<boolean> {
    const result = await this.db.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return result.count > 0;
  }
}
