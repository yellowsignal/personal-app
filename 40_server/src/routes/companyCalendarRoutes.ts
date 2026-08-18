import { Router, json } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { HttpError } from "../services/authService.js";
import type { CompanyCalendarService } from "../services/companyCalendarService.js";

function sendError(res: import("express").Response, err: unknown): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
}

export function createCompanyCalendarRouter(service: CompanyCalendarService, jwtSecret: string): Router {
  const router = Router();
  const auth = requireAuth(jwtSecret);

  router.get("/", auth, async (req: AuthedRequest, res) => {
    try {
      res.json(await service.get(req.userId!));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post("/import-url", auth, json(), async (req: AuthedRequest, res) => {
    try {
      res.json(await service.importFromUrl(req.userId!, req.body ?? {}));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post("/import-pdf", auth, async (req: AuthedRequest, res) => {
    try {
      const body = req.body;
      const bytes = Buffer.isBuffer(body)
        ? new Uint8Array(body)
        : body instanceof Uint8Array
          ? body
          : new Uint8Array();
      const yearRaw = req.query.year;
      const year = typeof yearRaw === "string" && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : undefined;
      const url = typeof req.query.url === "string" ? req.query.url : undefined;
      res.json(await service.importFromPdf(req.userId!, bytes, { url, year }));
    } catch (err) {
      sendError(res, err);
    }
  });

  router.delete("/", auth, async (req: AuthedRequest, res) => {
    try {
      res.json(await service.remove(req.userId!));
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
