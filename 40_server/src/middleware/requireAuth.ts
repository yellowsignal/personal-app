import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "../auth/token.js";

export interface AuthedRequest extends Request {
  userId?: number;
  userEmail?: string;
}

export function requireAuth(jwtSecret: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const header = req.header("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) {
      res.status(401).json({ error: "missing bearer token", code: "UNAUTHORIZED" });
      return;
    }
    try {
      const payload = verifyAuthToken(match[1]!, jwtSecret);
      req.userId = payload.userId;
      req.userEmail = payload.email;
      next();
    } catch {
      res.status(401).json({ error: "invalid or expired token", code: "UNAUTHORIZED" });
    }
  };
}
