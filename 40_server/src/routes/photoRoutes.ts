import express, { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { HttpError } from "../services/authService.js";
import type { PhotoService } from "../services/photoService.js";
import type { IcloudSharedAlbumService } from "../services/icloudSharedAlbumService.js";

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

export function createPhotoRouter(
  service: PhotoService,
  jwtSecret: string,
  icloud?: IcloudSharedAlbumService,
): Router {
  const router = Router();
  const auth = requireAuth(jwtSecret);

  router.get("/", auth, async (req: AuthedRequest, res) => {
    try {
      const items = await service.list(req.userId!);
      res.json(items);
    } catch (err) {
      sendError(res, err);
    }
  });

  if (icloud) {
    router.get("/icloud-albums", auth, async (req: AuthedRequest, res) => {
      try {
        res.json(await icloud.list(req.userId!));
      } catch (err) {
        sendError(res, err);
      }
    });

    router.post("/icloud-albums", auth, async (req: AuthedRequest, res) => {
      try {
        res.status(201).json(await icloud.add(req.userId!, req.body?.url));
      } catch (err) {
        sendError(res, err);
      }
    });

    router.get("/icloud-albums/:albumId/file", auth, async (req: AuthedRequest, res) => {
      try {
        const albumId = Number(req.params.albumId);
        const photoId = typeof req.query.photo === "string" ? req.query.photo : "";
        if (!Number.isFinite(albumId) || !photoId) {
          res.status(400).json({ error: "invalid album or photo" });
          return;
        }
        const file = await icloud.downloadPhoto(req.userId!, albumId, photoId);
        res.setHeader("content-type", file.mime);
        res.setHeader("content-disposition", `attachment; filename="${file.filename}"`);
        res.setHeader("cache-control", "private, max-age=300");
        res.send(file.bytes);
      } catch (err) {
        sendError(res, err);
      }
    });

    router.delete("/icloud-albums/:albumId", auth, async (req: AuthedRequest, res) => {
      try {
        const albumId = Number(req.params.albumId);
        if (!Number.isFinite(albumId)) {
          res.status(400).json({ error: "invalid id" });
          return;
        }
        res.json(await icloud.remove(req.userId!, albumId));
      } catch (err) {
        sendError(res, err);
      }
    });
  }

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
