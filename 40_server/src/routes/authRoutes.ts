import { Router } from "express";
import { AuthService, HttpError } from "../services/authService.js";
import { clearSessionCookie, setSessionCookie } from "../auth/sessionCookie.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";

function sendError(res: import("express").Response, err: unknown): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
}

function sendSession(
  res: import("express").Response,
  result: { token: string; user: unknown; family: unknown },
  status = 200,
): void {
  setSessionCookie(res, result.token);
  res.status(status).json(result);
}

export function createAuthRouter(service: AuthService, jwtSecret: string): Router {
  const router = Router();
  const auth = requireAuth(jwtSecret);

  router.post("/register", async (req, res) => {
    try {
      const result = await service.register(req.body ?? {});
      sendSession(res, result, 201);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post("/login", async (req, res) => {
    try {
      const result = await service.login(req.body ?? {});
      sendSession(res, result);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post("/logout", (_req, res) => {
    clearSessionCookie(res);
    res.status(204).end();
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
