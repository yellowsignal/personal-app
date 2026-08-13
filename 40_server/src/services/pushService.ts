import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import webpush from "web-push";
import type { PushRepository, PushSubscriptionRecord } from "../domain/pushRepository.js";
import { HttpError } from "./authService.js";

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

export interface PushSender {
  send(sub: PushSubscriptionRecord, payload: PushPayload): Promise<"ok" | "gone">;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function loadOrCreateVapidKeys(filePath: string, subject: string): VapidKeys {
  const fromEnvPublic = process.env.VAPID_PUBLIC_KEY?.trim();
  const fromEnvPrivate = process.env.VAPID_PRIVATE_KEY?.trim();
  if (fromEnvPublic && fromEnvPrivate) {
    return { publicKey: fromEnvPublic, privateKey: fromEnvPrivate, subject };
  }
  if (existsSync(filePath)) {
    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf8")) as { publicKey?: string; privateKey?: string };
      if (parsed.publicKey && parsed.privateKey) {
        return { publicKey: parsed.publicKey, privateKey: parsed.privateKey, subject };
      }
    } catch {
      /* regenerate */
    }
  }
  const generated = webpush.generateVAPIDKeys();
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify({ publicKey: generated.publicKey, privateKey: generated.privateKey }, null, 2));
  return { publicKey: generated.publicKey, privateKey: generated.privateKey, subject };
}

export class WebPushSender implements PushSender {
  constructor(keys: VapidKeys) {
    webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
  }

  async send(sub: PushSubscriptionRecord, payload: PushPayload): Promise<"ok" | "gone"> {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      );
      return "ok";
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return "gone";
      console.error("[push] send failed", status ?? err);
      return "ok";
    }
  }
}

export class PushService {
  constructor(
    private readonly repo: PushRepository,
    private readonly keys: VapidKeys,
    private readonly sender: PushSender,
  ) {}

  publicKey(): string {
    return this.keys.publicKey;
  }

  async subscribe(userId: number, body: Record<string, unknown>, userAgent: string | null) {
    const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
    const keys = body.keys && typeof body.keys === "object" ? (body.keys as Record<string, unknown>) : null;
    const p256dh = typeof keys?.p256dh === "string" ? keys.p256dh.trim() : "";
    const auth = typeof keys?.auth === "string" ? keys.auth.trim() : "";
    if (!endpoint || !p256dh || !auth) {
      throw new HttpError(400, "endpoint, keys.p256dh, and keys.auth are required");
    }
    const record = await this.repo.upsert({
      userId,
      endpoint,
      p256dh,
      auth,
      userAgent: userAgent?.slice(0, 500) ?? null,
    });
    return { id: record.id, endpoint: record.endpoint };
  }

  async unsubscribe(userId: number, body: Record<string, unknown>) {
    const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
    if (!endpoint) throw new HttpError(400, "endpoint is required");
    await this.repo.removeForUserEndpoint(userId, endpoint);
  }

  async status(userId: number) {
    const rows = await this.repo.listForUser(userId);
    return { subscribed: rows.length > 0, count: rows.length };
  }

  async sendToUsers(userIds: number[], payload: PushPayload): Promise<number> {
    const subs = await this.repo.listForUsers(userIds);
    let sent = 0;
    for (const sub of subs) {
      const result = await this.sender.send(sub, payload);
      if (result === "gone") {
        await this.repo.removeByEndpoint(sub.endpoint);
        continue;
      }
      sent += 1;
    }
    return sent;
  }
}
