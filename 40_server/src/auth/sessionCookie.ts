import type { Request, Response } from "express";

/** HttpOnly session cookie carrying the JWT (same value as JSON `token`). */
export const SESSION_COOKIE_NAME = "myfamilyhub_session";

const MAX_AGE_SEC = 7 * 24 * 60 * 60;

function wantSecureCookie(req: Request): boolean {
  if (process.env.COOKIE_SECURE === "0") return false;
  if (process.env.COOKIE_SECURE === "1") return true;
  const forwarded = req.headers["x-forwarded-proto"];
  if (typeof forwarded === "string" && forwarded.split(",")[0]?.trim() === "https") {
    return true;
  }
  // Local Vite / MEMORY_AUTH over http — do not set Secure or the browser drops the cookie.
  return false;
}

function buildCookie(token: string, req: Request, maxAge: number): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (wantSecureCookie(req)) parts.push("Secure");
  return parts.join("; ");
}

export function setSessionCookie(res: Response, token: string): void {
  res.append("Set-Cookie", buildCookie(token, res.req, MAX_AGE_SEC));
}

export function clearSessionCookie(res: Response): void {
  res.append("Set-Cookie", buildCookie("", res.req, 0));
}

export function readSessionCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq);
    if (name !== SESSION_COOKIE_NAME) continue;
    const raw = trimmed.slice(eq + 1);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}
