import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { HttpError } from "../services/authService.js";
import type { RecurringDepositService } from "../services/recurringDepositService.js";

function sendError(res: import("express").Response, err: unknown): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
}

/** Nested under /api/assets/:assetId/recurring-deposits + top-level /api/recurring-deposits/:id */
export function createRecurringDepositRouter(service: RecurringDepositService, jwtSecret: string): Router {
  const router = Router({ mergeParams: true });
  const auth = requireAuth(jwtSecret);

  router.get("/assets/:assetId/recurring-deposits", auth, async (req: AuthedRequest, res) => {
    try {
      const assetId = Number(req.params.assetId);
      if (!Number.isFinite(assetId)) {
        res.status(400).json({ error: "invalid asset id" });
        return;
      }
      const items = await service.listForAsset(req.userId!, assetId);
      res.json(items);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post("/assets/:assetId/recurring-deposits", auth, async (req: AuthedRequest, res) => {
    try {
      const assetId = Number(req.params.assetId);
      if (!Number.isFinite(assetId)) {
        res.status(400).json({ error: "invalid asset id" });
        return;
      }
      const created = await service.create(req.userId!, assetId, req.body ?? {});
      res.status(201).json(created);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.patch("/recurring-deposits/:id", auth, async (req: AuthedRequest, res) => {
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

  router.delete("/recurring-deposits/:id", auth, async (req: AuthedRequest, res) => {
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
