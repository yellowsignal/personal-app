import { Router } from "express";
import { AuthService, HttpError } from "../services/authService.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";

function sendError(res: import("express").Response, err: unknown): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
}

export function createAuthRouter(service: AuthService, jwtSecret: string): Router {
  const router = Router();
  const auth = requireAuth(jwtSecret);

  router.post("/register", async (req, res) => {
    try {
      const result = await service.register(req.body ?? {});
      res.status(201).json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post("/login", async (req, res) => {
    try {
      const result = await service.login(req.body ?? {});
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get("/me", auth, async (req: AuthedRequest, res) => {
    try {
      const result = await service.me(req.userId!);
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.patch("/me", auth, async (req: AuthedRequest, res) => {
    try {
      const result = await service.updateMe(req.userId!, req.body ?? {});
      res.json(result);
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
