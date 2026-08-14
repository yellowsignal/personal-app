import { appendFileSync } from "node:fs";
import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth.js";
import { HttpError } from "../services/authService.js";
import type { CalendarService } from "../services/calendarService.js";

function sendError(res: import("express").Response, err: unknown): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
}

// #region agent log
function agentLog(hypothesisId: string, location: string, message: string, data: Record<string, unknown>) {
  try {
    appendFileSync(
      "/opt/cursor/logs/debug.log",
      JSON.stringify({ hypothesisId, location, message, data, timestamp: Date.now() }) + "\n",
    );
  } catch {
    /* ignore */
  }
}
// #endregion

export function createCalendarRouter(service: CalendarService, jwtSecret: string): Router {
  const router = Router();
  const auth = requireAuth(jwtSecret);

  router.get("/events", auth, async (req: AuthedRequest, res) => {
    try {
      const items = await service.list(req.userId!, {
        from: req.query.from,
        to: req.query.to,
        scope: req.query.scope,
      });
      // #region agent log
      agentLog("C", "calendarRoutes.ts:GET", "GET /events result", {
        userId: req.userId,
        from: req.query.from,
        to: req.query.to,
        scope: req.query.scope,
        count: items.length,
        sampleIds: items.slice(0, 5).map((i) => i.id),
      });
      // #endregion
      res.json(items);
    } catch (err) {
      // #region agent log
      agentLog("C", "calendarRoutes.ts:GET", "GET /events error", {
        msg: err instanceof Error ? err.message : String(err),
      });
      // #endregion
      sendError(res, err);
    }
  });

  router.post("/events", auth, async (req: AuthedRequest, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      // #region agent log
      agentLog("A", "calendarRoutes.ts:POST", "POST /events entry", {
        userId: req.userId,
        keys: Object.keys(body),
        date: body.date,
        endDate: body.endDate,
        time: body.time,
        endTime: body.endTime,
        category: body.category,
        isShared: body.isShared,
        reminderMinutesBefore: body.reminderMinutesBefore,
        hasRecurrence: body.recurrence != null,
        recurrence: body.recurrence ?? null,
      });
      // #endregion
      const created = await service.create(req.userId!, req.body ?? {});
      // #region agent log
      agentLog("A", "calendarRoutes.ts:POST", "POST /events success", {
        id: created.id,
        date: created.date,
        endDate: created.endDate,
        isAllDay: created.isAllDay,
        reminderMinutesBefore: created.reminderMinutesBefore,
        isShared: created.isShared,
      });
      // #endregion
      res.status(201).json(created);
    } catch (err) {
      // #region agent log
      agentLog("A,B,E", "calendarRoutes.ts:POST", "POST /events error", {
        status: err instanceof HttpError ? err.status : 500,
        msg: err instanceof HttpError ? err.message : err instanceof Error ? err.message : String(err),
        code: err instanceof HttpError ? err.code : undefined,
      });
      // #endregion
      sendError(res, err);
    }
  });

  router.patch("/events/:id", auth, async (req: AuthedRequest, res) => {
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

  router.delete("/events/:id", auth, async (req: AuthedRequest, res) => {
    try {
      const id = req.params.id;
      if (!id) {
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
