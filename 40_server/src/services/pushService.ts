import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import webpush from "web-push";
import type { PushRepository, PushSubscriptionRecord } from "../domain/pushRepository.js";
import { agentLog } from "../debugNdjson.js";
import { HttpError } from "./authService.js";

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
  /** App icon badge count (LINE-style). */
  unreadCount?: number;
}

export interface PushSender {
  send(sub: PushSubscriptionRecord, payload: PushPayload): Promise<"ok" | "gone">;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

function appOrigin(): string {
  const raw = (process.env.WEBAUTHN_ORIGIN ?? process.env.PUBLIC_APP_ORIGIN ?? "").trim().replace(/\/$/, "");
  return raw || "http://localhost:5173";
}

/** Declarative Web Push JSON (iOS 18.4+) with legacy fields for older service workers. */
export function toPushWirePayload(payload: PushPayload): Record<string, unknown> {
  const path = payload.url.startsWith("http")
    ? payload.url
    : `${appOrigin()}${payload.url.startsWith("/") ? payload.url : `/${payload.url}`}`;
  const tag = payload.tag?.trim() || "calendar-reminder";
  return {
    web_push: 8030,
    notification: {
      title: payload.title,
      body: payload.body,
      navigate: path,
      silent: false,
      tag,
      renotify: true,
    },
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag,
    unreadCount: payload.unreadCount,
  };
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
    const topic = (payload.tag ?? "calendar-reminder")
      .replace(/[^A-Za-z0-9_-]/g, "-")
      .slice(0, 32);
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(toPushWirePayload(payload)),
        {
          urgency: "high",
          TTL: 60 * 60,
          topic: topic || "calendar-reminder",
        },
      );
      return "ok";
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // #region agent log
      agentLog("C", "pushService.ts:WebPushSender.send", "send error", {
        status: status ?? null,
        tag: payload.tag ?? null,
        topicLen: topic.length,
      });
      // #endregion
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
    // #region agent log
    agentLog("C", "pushService.ts:sendToUsers", "subscriptions loaded", {
      userIds,
      subCount: subs.length,
      tag: payload.tag ?? null,
      titleLen: payload.title.length,
    });
    agentLog("G", "pushService.ts:sendToUsers", "ios tag/topic", {
      tag: payload.tag ?? null,
      tagLen: (payload.tag ?? "").length,
      topic: (payload.tag ?? "calendar-reminder").replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 32),
    });
    // #endregion
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

  async sendTest(userId: number): Promise<{ sent: number }> {
    const sent = await this.sendToUsers([userId], {
      title: "すみっチョぐらし",
      body: "알림 테스트 · 소리가 나면 설정이 된 거예요",
      url: "/calendar",
      tag: `push-test-${Date.now()}`,
    });
    if (sent < 1) throw new HttpError(400, "no push subscription on this account", "PUSH_NOT_SUBSCRIBED");
    return { sent };
  }
}
