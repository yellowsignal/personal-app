import { Router } from "express";
import { HttpError } from "../services/authService.js";
import type { FamilyActivityService } from "../services/familyActivityService.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";

function sendError(res: import("express").Response, err: unknown): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
}

export function createFamilyActivityRouter(service: FamilyActivityService, jwtSecret: string): Router {
  const router = Router();
  const auth = requireAuth(jwtSecret);

  router.get("/activity/summary", auth, async (req: AuthedRequest, res) => {
    try {
      res.json(await service.summary(req.userId!));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get("/activity", auth, async (req: AuthedRequest, res) => {
    try {
      const limit = Number(req.query.limit ?? 30);
      res.json(await service.list(req.userId!, Number.isFinite(limit) ? limit : 30));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post("/activity/read", auth, async (req: AuthedRequest, res) => {
    try {
      res.json(await service.markRead(req.userId!, req.body ?? {}));
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
