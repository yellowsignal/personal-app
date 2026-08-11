import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createApp } from "./app.js";
import { TaskStore } from "./store.js";
import { prisma } from "./db.js";
import { PrismaAuthRepository } from "./domain/prismaAuthRepository.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 3001);
const DATA_FILE = process.env.DATA_FILE ?? resolve(__dirname, "../../30_data/tasks.json");
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

const store = new TaskStore(DATA_FILE);
const authRepo = new PrismaAuthRepository(prisma);
const app = createApp(store, { authRepo, jwtSecret: JWT_SECRET });

app.listen(PORT, () => {
  console.log(`[server] personal-app API listening on http://localhost:${PORT}`);
  console.log(`[server] persisting tasks to ${DATA_FILE}`);
  console.log(`[server] auth/family routes enabled (JWT)`);
});
