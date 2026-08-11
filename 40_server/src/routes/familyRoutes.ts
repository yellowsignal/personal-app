import { Router } from "express";
import { AuthService, HttpError } from "../services/authService.js";
import { PasskeyService } from "../services/passkeyService.js";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";

function sendError(res: import("express").Response, err: unknown): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
}

export function createFamilyRouter(
  service: AuthService,
  passkeyService: PasskeyService | null,
  jwtSecret: string,
): Router {
  const router = Router();
  const auth = requireAuth(jwtSecret);

  router.get("/", auth, async (req: AuthedRequest, res) => {
    try {
      const family = await service.getFamily(req.userId!);
      res.json(family);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post("/join", auth, async (req: AuthedRequest, res) => {
    try {
      const family = await service.joinFamily(req.userId!, req.body ?? {});
      res.json(family);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post("/invite/rotate", auth, async (req: AuthedRequest, res) => {
    try {
      const family = await service.rotateInvite(req.userId!);
      res.json(family);
    } catch (err) {
      sendError(res, err);
    }
  });

  if (passkeyService) {
    router.post("/invite/create", auth, async (req: AuthedRequest, res) => {
      try {
        const invite = await passkeyService.createInviteToken(req.userId!);
        res.status(201).json(invite);
      } catch (err) {
        sendError(res, err);
      }
    });
  }

  return router;
}
