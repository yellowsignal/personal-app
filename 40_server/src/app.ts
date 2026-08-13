import cors from "cors";
import express, { type Express } from "express";
import { TaskStore } from "./store.js";
import type { AuthRepository } from "./domain/authRepository.js";
import type { AssetRepository } from "./domain/assetRepository.js";
import type { SubscriptionRepository } from "./domain/subscriptionRepository.js";
import type { ChecklistRepository } from "./domain/checklistRepository.js";
import type { DocumentRepository } from "./domain/documentRepository.js";
import type { InviteTokenRepository, PasskeyRepository } from "./domain/passkeyTypes.js";
import { AuthService } from "./services/authService.js";
import { AssetService } from "./services/assetService.js";
import { SubscriptionService } from "./services/subscriptionService.js";
import { ChecklistService } from "./services/checklistService.js";
import { DocumentService } from "./services/documentService.js";
import { PasskeyService } from "./services/passkeyService.js";
import { ChallengeStore } from "./auth/challengeStore.js";
import { createAuthRouter } from "./routes/authRoutes.js";
import { createFamilyRouter } from "./routes/familyRoutes.js";
import { createAssetRouter } from "./routes/assetRoutes.js";
import { createSubscriptionRouter } from "./routes/subscriptionRoutes.js";
import { createChecklistRouter } from "./routes/checklistRoutes.js";
import { createDocumentRouter } from "./routes/documentRoutes.js";
import { createPasskeyRouter } from "./routes/passkeyRoutes.js";
import type { DocumentScanStore } from "./storage/documentScanStore.js";
import type { TransactionRepository } from "./domain/transactionRepository.js";
import { TransactionService } from "./services/transactionService.js";
import type { RecurringDepositRepository } from "./domain/recurringDepositRepository.js";
import { RecurringDepositService } from "./services/recurringDepositService.js";
import { createRecurringDepositRouter } from "./routes/recurringDepositRoutes.js";

export interface AppDeps {
  authRepo?: AuthRepository;
  assetRepo?: AssetRepository;
  transactionRepo?: TransactionRepository;
  recurringDepositRepo?: RecurringDepositRepository;
  subscriptionRepo?: SubscriptionRepository;
  checklistRepo?: ChecklistRepository;
  documentRepo?: DocumentRepository;
  documentScanStore?: DocumentScanStore;
  passkeyRepo?: PasskeyRepository;
  inviteTokenRepo?: InviteTokenRepository;
  challengeStore?: ChallengeStore;
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

    const passkeyService =
      deps.passkeyRepo && deps.inviteTokenRepo && deps.challengeStore
        ? new PasskeyService(
            deps.authRepo,
            deps.passkeyRepo,
            deps.inviteTokenRepo,
            deps.challengeStore,
            jwtSecret,
          )
        : null;

    app.use("/api/family", createFamilyRouter(authService, passkeyService, jwtSecret));

    if (deps.assetRepo) {
      const assetService = new AssetService(deps.authRepo, deps.assetRepo);
      const transactionService =
        deps.transactionRepo
          ? new TransactionService(deps.authRepo, deps.assetRepo, deps.transactionRepo)
          : undefined;
      const recurringDepositService =
        deps.recurringDepositRepo && deps.transactionRepo
          ? new RecurringDepositService(
              deps.authRepo,
              deps.assetRepo,
              deps.recurringDepositRepo,
              deps.transactionRepo,
            )
          : undefined;
      app.use(
        "/api/assets",
        createAssetRouter(assetService, jwtSecret, transactionService, recurringDepositService),
      );
      if (recurringDepositService) {
        app.use("/api", createRecurringDepositRouter(recurringDepositService, jwtSecret));
      }
    }

    if (deps.subscriptionRepo) {
      const subscriptionService = new SubscriptionService(
        deps.authRepo,
        deps.subscriptionRepo,
        passkeyService,
      );
      app.use("/api/subscriptions", createSubscriptionRouter(subscriptionService, jwtSecret));
    }

    if (deps.checklistRepo) {
      const checklistService = new ChecklistService(deps.authRepo, deps.checklistRepo);
      app.use("/api/checklists", createChecklistRouter(checklistService, jwtSecret));
    }

    if (deps.documentRepo) {
      const documentService = new DocumentService(
        deps.authRepo,
        deps.documentRepo,
        passkeyService,
        deps.documentScanStore ?? null,
      );
      app.use("/api/documents", createDocumentRouter(documentService, jwtSecret));
    }

    if (passkeyService) {
      app.use("/api/auth/passkey", createPasskeyRouter(passkeyService, jwtSecret));
    }
  }

  return app;
}
