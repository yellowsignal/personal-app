import cors from "cors";
import express, { type Express } from "express";
import { TaskStore } from "./store.js";
import type { AuthRepository } from "./domain/authRepository.js";
import type { SubscriptionRepository } from "./domain/subscriptionRepository.js";
import { AuthService } from "./services/authService.js";
import { SubscriptionService } from "./services/subscriptionService.js";
import { createAuthRouter } from "./routes/authRoutes.js";
import { createFamilyRouter } from "./routes/familyRoutes.js";
import { createSubscriptionRouter } from "./routes/subscriptionRoutes.js";

export interface AppDeps {
  authRepo?: AuthRepository;
  subscriptionRepo?: SubscriptionRepository;
  jwtSecret?: string;
}

export function createApp(store: TaskStore, deps: AppDeps = {}): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  app.get("/api/tasks", (_req, res) => {
    res.json(store.list());
  });

  app.post("/api/tasks", (req, res) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    if (!title) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    res.status(201).json(store.create(title));
  });

  app.patch("/api/tasks/:id", (req, res) => {
    const task = store.toggle(req.params.id);
    if (!task) {
      res.status(404).json({ error: "task not found" });
      return;
    }
    res.json(task);
  });

  app.delete("/api/tasks/:id", (req, res) => {
    const removed = store.remove(req.params.id);
    if (!removed) {
      res.status(404).json({ error: "task not found" });
      return;
    }
    res.status(204).end();
  });

  if (deps.authRepo) {
    const jwtSecret = deps.jwtSecret ?? process.env.JWT_SECRET ?? "dev-secret-change-me";
    const authService = new AuthService(deps.authRepo, jwtSecret);
    app.use("/api/auth", createAuthRouter(authService, jwtSecret));
    app.use("/api/family", createFamilyRouter(authService, jwtSecret));

    if (deps.subscriptionRepo) {
      const subscriptionService = new SubscriptionService(deps.authRepo, deps.subscriptionRepo);
      app.use("/api/subscriptions", createSubscriptionRouter(subscriptionService, jwtSecret));
    }
  }

  return app;
}
