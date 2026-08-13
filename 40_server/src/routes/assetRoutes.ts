import { Router } from "express";
import express from "express";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { HttpError } from "../services/authService.js";
import { AssetService } from "../services/assetService.js";
import type { TransactionService } from "../services/transactionService.js";

const csvBodyParser = express.text({
  type: ["text/csv", "text/plain", "application/csv", "application/vnd.ms-excel"],
  limit: "2mb",
});

function sendError(res: import("express").Response, err: unknown): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
}

export function createAssetRouter(
  service: AssetService,
  jwtSecret: string,
  transactionService?: TransactionService,
  recurringDepositService?: import("../services/recurringDepositService.js").RecurringDepositService,
): Router {
  const router = Router();
  const auth = requireAuth(jwtSecret);

  router.get("/", auth, async (req: AuthedRequest, res) => {
    try {
      if (recurringDepositService) {
        await recurringDepositService.applyDueForUser(req.userId!);
      }
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

  router.post("/refresh-prices", auth, async (req: AuthedRequest, res) => {
    try {
      const items = await service.refreshAllPrices(req.userId!);
      res.json(items);
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post("/:id/refresh-price", auth, async (req: AuthedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "invalid id" });
        return;
      }
      const updated = await service.refreshPrice(req.userId!, id);
      res.json(updated);
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

  if (transactionService) {
    router.get("/:id/transactions", auth, async (req: AuthedRequest, res) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
          res.status(400).json({ error: "invalid id" });
          return;
        }
        if (recurringDepositService) {
          await recurringDepositService.applyDueForAsset(req.userId!, id);
        }
        const items = await transactionService.listForAsset(req.userId!, id);
        res.json(items);
      } catch (err) {
        sendError(res, err);
      }
    });

    router.post("/:id/set-balance", auth, async (req: AuthedRequest, res) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
          res.status(400).json({ error: "invalid id" });
          return;
        }
        const updated = await transactionService.setBalance(
          req.userId!,
          id,
          (req.body as { amount?: unknown })?.amount,
        );
        res.json(updated);
      } catch (err) {
        sendError(res, err);
      }
    });

    router.post("/:id/import-statement", auth, csvBodyParser, async (req: AuthedRequest, res) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
          res.status(400).json({ error: "invalid id" });
          return;
        }
        const csvText = typeof req.body === "string" ? req.body : "";
        if (!csvText.trim()) {
          res.status(400).json({ error: "CSV body is required" });
          return;
        }
        const result = await transactionService.importStatement(req.userId!, id, csvText);
        res.status(201).json(result);
      } catch (err) {
        sendError(res, err);
      }
    });
  }

  return router;
}
