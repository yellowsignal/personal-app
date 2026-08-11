import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { HttpError } from "../services/authService.js";
import { SubscriptionService } from "../services/subscriptionService.js";

function sendError(res: import("express").Response, err: unknown): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
}

export function createSubscriptionRouter(service: SubscriptionService, jwtSecret: string): Router {
  const router = Router();
  const auth = requireAuth(jwtSecret);

  router.get("/", auth, async (req: AuthedRequest, res) => {
    try {
      const scope = typeof req.query.scope === "string" ? req.query.scope : "all";
      const items = await service.list(req.userId!, scope);
      res.json(items);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post("/", auth, async (req: AuthedRequest, res) => {
    try {
      const created = await service.create(req.userId!, req.body ?? {});
      res.status(201).json(created);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.patch("/:id", auth, async (req: AuthedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "invalid id" });
        return;
      }
      const updated = await service.update(req.userId!, id, req.body ?? {});
      res.json(updated);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.delete("/:id", auth, async (req: AuthedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "invalid id" });
        return;
      }
      await service.remove(req.userId!, id);
      res.status(204).end();
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
