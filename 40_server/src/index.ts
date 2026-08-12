import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createApp } from "./app.js";
import { TaskStore } from "./store.js";
import { prisma } from "./db.js";
import { MemoryAuthRepository } from "./domain/memoryAuthRepository.js";
import { PrismaAuthRepository } from "./domain/prismaAuthRepository.js";
import { MemoryAssetRepository } from "./domain/memoryAssetRepository.js";
import { PrismaAssetRepository } from "./domain/prismaAssetRepository.js";
import { MemorySubscriptionRepository } from "./domain/memorySubscriptionRepository.js";
import { PrismaSubscriptionRepository } from "./domain/prismaSubscriptionRepository.js";
import { MemoryChecklistRepository } from "./domain/memoryChecklistRepository.js";
import { PrismaChecklistRepository } from "./domain/prismaChecklistRepository.js";
import { MemoryDocumentRepository } from "./domain/memoryDocumentRepository.js";
import { PrismaDocumentRepository } from "./domain/prismaDocumentRepository.js";
import { MemoryPasskeyRepository } from "./domain/memoryPasskeyRepository.js";
import { MemoryInviteTokenRepository } from "./domain/memoryInviteTokenRepository.js";
import {
  PrismaInviteTokenRepository,
  PrismaPasskeyRepository,
} from "./domain/prismaPasskeyRepository.js";
import { ChallengeStore } from "./auth/challengeStore.js";
import type { AuthRepository } from "./domain/authRepository.js";
import type { AssetRepository } from "./domain/assetRepository.js";
import type { SubscriptionRepository } from "./domain/subscriptionRepository.js";
import type { ChecklistRepository } from "./domain/checklistRepository.js";
import type { DocumentRepository } from "./domain/documentRepository.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 3001);
const DATA_FILE = process.env.DATA_FILE ?? resolve(__dirname, "../../30_data/tasks.json");
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const useMemoryAuth =
  process.env.MEMORY_AUTH === "1" || process.env.MEMORY_AUTH === "true";

const store = new TaskStore(DATA_FILE);
const authRepo: AuthRepository = useMemoryAuth
  ? new MemoryAuthRepository()
  : new PrismaAuthRepository(prisma);
const assetRepo: AssetRepository = useMemoryAuth
  ? new MemoryAssetRepository()
  : new PrismaAssetRepository(prisma);
const subscriptionRepo: SubscriptionRepository = useMemoryAuth
  ? new MemorySubscriptionRepository()
  : new PrismaSubscriptionRepository(prisma);
const checklistRepo: ChecklistRepository = useMemoryAuth
  ? new MemoryChecklistRepository()
  : new PrismaChecklistRepository(prisma);
const documentRepo: DocumentRepository = useMemoryAuth
  ? new MemoryDocumentRepository()
  : new PrismaDocumentRepository(prisma);
const passkeyRepo = useMemoryAuth ? new MemoryPasskeyRepository() : new PrismaPasskeyRepository(prisma);
const inviteTokenRepo = useMemoryAuth
  ? new MemoryInviteTokenRepository()
  : new PrismaInviteTokenRepository(prisma);
const challengeStore = new ChallengeStore();
const app = createApp(store, {
  authRepo,
  assetRepo,
  subscriptionRepo,
  checklistRepo,
  documentRepo,
  passkeyRepo,
  inviteTokenRepo,
  challengeStore,
  jwtSecret: JWT_SECRET,
});

app.listen(PORT, () => {
  console.log(`[server] personal-app API listening on http://localhost:${PORT}`);
  console.log(`[server] persisting tasks to ${DATA_FILE}`);
  console.log(
    `[server] auth/family/assets/subscriptions/checklists/documents/passkey routes enabled (JWT, store=${
      useMemoryAuth ? "memory" : "prisma"
    })`,
  );
});
