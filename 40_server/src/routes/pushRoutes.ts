import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { HttpError } from "../services/authService.js";
import type { PushService } from "../services/pushService.js";

function sendError(res: import("express").Response, err: unknown): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
}

export function createPushRouter(service: PushService, jwtSecret: string): Router {
  const router = Router();
  const auth = requireAuth(jwtSecret);

  router.get("/vapid-public-key", (_req, res) => {
    res.json({ publicKey: service.publicKey() });
  });

  router.get("/status", auth, async (req: AuthedRequest, res) => {
    try {
      res.json(await service.status(req.userId!));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post("/subscribe", auth, async (req: AuthedRequest, res) => {
    try {
      const created = await service.subscribe(
        req.userId!,
        req.body ?? {},
        typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
      );
      res.status(201).json(created);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.delete("/subscribe", auth, async (req: AuthedRequest, res) => {
    try {
      await service.unsubscribe(req.userId!, req.body ?? {});
      res.status(204).end();
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
