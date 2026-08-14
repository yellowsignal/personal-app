import express, { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { HttpError } from "../services/authService.js";
import type { PhotoService } from "../services/photoService.js";

const imageBodyParser = express.raw({
  type: [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/heic-sequence",
    "application/octet-stream",
  ],
  limit: "12mb",
});

function sendError(res: import("express").Response, err: unknown): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
}

export function createPhotoRouter(service: PhotoService, jwtSecret: string): Router {
  const router = Router();
  const auth = requireAuth(jwtSecret);

  router.get("/", auth, async (req: AuthedRequest, res) => {
    try {
      const items = await service.list(req.userId!, req.query.scope);
      res.json(items);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post("/", auth, imageBodyParser, async (req: AuthedRequest, res) => {
    try {
      const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
      const created = await service.create(
        req.userId!,
        {
          caption: typeof req.query.caption === "string" ? req.query.caption : undefined,
          isShared: req.query.isShared,
        },
        { bytes, mime: req.header("content-type") },
      );
      res.status(201).json(created);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.get("/:id/file", auth, async (req: AuthedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "invalid id" });
        return;
      }
      const file = await service.readFile(req.userId!, id);
      res.setHeader("content-type", file.mime);
      res.setHeader("cache-control", "private, max-age=3600");
      res.send(file.bytes);
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
