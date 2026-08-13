import { apiFetch } from "./http";

function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export async function registerPushWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

export const pushApi = {
  vapidPublicKey() {
    return apiFetch<{ publicKey: string }>("/api/push/vapid-public-key");
  },
  status(token: string) {
    return apiFetch<{ subscribed: boolean; count: number }>("/api/push/status", { token });
  },
  subscribe(token: string, body: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    return apiFetch<{ id: number; endpoint: string }>("/api/push/subscribe", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    });
  },
  unsubscribe(token: string, endpoint: string) {
    return apiFetch<void>("/api/push/subscribe", {
      method: "DELETE",
      token,
      body: JSON.stringify({ endpoint }),
    });
  },
};

export async function enableHomeScreenPush(token: string): Promise<"ok" | "denied" | "unsupported"> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "denied";
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await registerPushWorker());
  if (!reg) return "unsupported";
  await navigator.serviceWorker.ready;
  const { publicKey } = await pushApi.vapidPublicKey();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return "unsupported";
  await pushApi.subscribe(token, {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
  return "ok";
}

export async function disableHomeScreenPush(token: string): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await pushApi.unsubscribe(token, sub.endpoint);
    await sub.unsubscribe();
  }
}
