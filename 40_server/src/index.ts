import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createApp } from "./app.js";
import { TaskStore } from "./store.js";
import { prisma } from "./db.js";
import { MemoryAuthRepository } from "./domain/memoryAuthRepository.js";
import { PrismaAuthRepository } from "./domain/prismaAuthRepository.js";
import { MemorySubscriptionRepository } from "./domain/memorySubscriptionRepository.js";
import { PrismaSubscriptionRepository } from "./domain/prismaSubscriptionRepository.js";
import type { AuthRepository } from "./domain/authRepository.js";
import type { SubscriptionRepository } from "./domain/subscriptionRepository.js";

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
const subscriptionRepo: SubscriptionRepository = useMemoryAuth
  ? new MemorySubscriptionRepository()
  : new PrismaSubscriptionRepository(prisma);
const app = createApp(store, { authRepo, subscriptionRepo, jwtSecret: JWT_SECRET });

app.listen(PORT, () => {
  console.log(`[server] personal-app API listening on http://localhost:${PORT}`);
  console.log(`[server] persisting tasks to ${DATA_FILE}`);
  console.log(
    `[server] auth/family/subscriptions routes enabled (JWT, store=${useMemoryAuth ? "memory" : "prisma"})`,
  );
});
