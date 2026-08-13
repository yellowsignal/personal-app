export interface PushSubscriptionRecord {
  id: number;
  userId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertPushSubscriptionInput {
  userId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
}

export interface PushRepository {
  upsert(input: UpsertPushSubscriptionInput): Promise<PushSubscriptionRecord>;
  listForUser(userId: number): Promise<PushSubscriptionRecord[]>;
  listForUsers(userIds: number[]): Promise<PushSubscriptionRecord[]>;
  removeByEndpoint(endpoint: string): Promise<boolean>;
  removeForUserEndpoint(userId: number, endpoint: string): Promise<boolean>;
}
