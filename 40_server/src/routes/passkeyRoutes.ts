import { Router } from "express";
import { setSessionCookie } from "../auth/sessionCookie.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { HttpError } from "../services/authService.js";
import { PasskeyService } from "../services/passkeyService.js";

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
  session: { token: string; user: unknown; family: unknown },
  status = 200,
): void {
  setSessionCookie(res, session.token);
  res.status(status).json(session);
}

export function createPasskeyRouter(service: PasskeyService, jwtSecret: string): Router {
  const router = Router();
  const auth = requireAuth(jwtSecret);

  router.post("/register/options", async (req, res) => {
    try {
      const options = await service.registrationOptions(req.body ?? {});
      res.json(options);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post("/register/verify", async (req, res) => {
    try {
      const session = await service.registrationVerify(req.body ?? {});
      sendSession(res, session, 201);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post("/login/options", async (_req, res) => {
    try {
      const options = await service.loginOptions();
      res.json(options);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post("/login/verify", async (req, res) => {
    try {
      const session = await service.loginVerify(req.body ?? {});
      sendSession(res, session);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post("/link/options", auth, async (req: AuthedRequest, res) => {
    try {
      const options = await service.registrationOptions(
        { ...req.body, flow: "link", name: "link" },
        req.userId!,
      );
      res.json(options);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post("/link/verify", auth, async (req: AuthedRequest, res) => {
    try {
      const session = await service.registrationVerify(req.body ?? {}, req.userId!);
      sendSession(res, session);
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
