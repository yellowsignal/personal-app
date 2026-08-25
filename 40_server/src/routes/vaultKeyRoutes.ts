import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { HttpError } from "../services/authService.js";
import { VaultKeyService } from "../services/vaultKeyService.js";

function sendError(res: import("express").Response, err: unknown): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
}

export function createVaultKeyRouter(service: VaultKeyService, jwtSecret: string): Router {
  const router = Router();
  const auth = requireAuth(jwtSecret);

  router.get("/me", auth, async (req: AuthedRequest, res) => {
    try {
      res.json(await service.me(req.userId!));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.put("/setup", auth, async (req: AuthedRequest, res) => {
    try {
      const result = await service.setup(req.userId!, req.body ?? {});
      res.status(201).json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get("/family", auth, async (req: AuthedRequest, res) => {
    try {
      res.json(await service.listFamily(req.userId!));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post("/deliver-family", auth, async (req: AuthedRequest, res) => {
    try {
      res.json(await service.deliverFamilyDek(req.userId!, req.body ?? {}));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post("/accept-family", auth, async (req: AuthedRequest, res) => {
    try {
      res.json(await service.acceptFamilyDek(req.userId!, req.body ?? {}));
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
