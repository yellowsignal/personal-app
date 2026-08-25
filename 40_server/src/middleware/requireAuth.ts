import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "../auth/token.js";
import { readSessionCookie } from "../auth/sessionCookie.js";

export interface AuthedRequest extends Request {
  userId?: number;
  userEmail?: string;
}

function extractToken(req: Request): string | null {
  const header = req.header("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (match?.[1]) return match[1];
  return readSessionCookie(req);
}

export function requireAuth(jwtSecret: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({ error: "missing session", code: "UNAUTHORIZED" });
      return;
    }
    try {
      const payload = verifyAuthToken(token, jwtSecret);
      req.userId = payload.userId;
      req.userEmail = payload.email;
      next();
    } catch {
      res.status(401).json({ error: "invalid or expired token", code: "UNAUTHORIZED" });
    }
  };
}
