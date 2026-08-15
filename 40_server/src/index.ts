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
import { DocumentScanStore, defaultDocumentScanDir } from "./storage/documentScanStore.js";
import { MemoryPhotoRepository } from "./domain/memoryPhotoRepository.js";
import { PrismaPhotoRepository } from "./domain/prismaPhotoRepository.js";
import type { PhotoRepository } from "./domain/photoRepository.js";
import { PhotoStore, defaultPhotoDir } from "./storage/photoStore.js";
import { AlbumCoverStore, defaultAlbumCoverDir } from "./storage/albumCoverStore.js";
import { MemoryFamilyIcloudAlbumRepository } from "./domain/memoryFamilyIcloudAlbumRepository.js";
import { PrismaFamilyIcloudAlbumRepository } from "./domain/prismaFamilyIcloudAlbumRepository.js";
import type { FamilyIcloudAlbumRepository } from "./domain/familyIcloudAlbumRepository.js";
import type { AuthRepository } from "./domain/authRepository.js";
import type { AssetRepository } from "./domain/assetRepository.js";
import type { SubscriptionRepository } from "./domain/subscriptionRepository.js";
import type { ChecklistRepository } from "./domain/checklistRepository.js";
import type { DocumentRepository } from "./domain/documentRepository.js";
import { MemoryTransactionRepository } from "./domain/memoryTransactionRepository.js";
import { PrismaTransactionRepository } from "./domain/prismaTransactionRepository.js";
import type { TransactionRepository } from "./domain/transactionRepository.js";
import { MemoryRecurringDepositRepository } from "./domain/memoryRecurringDepositRepository.js";
import { PrismaRecurringDepositRepository } from "./domain/prismaRecurringDepositRepository.js";
import type { RecurringDepositRepository } from "./domain/recurringDepositRepository.js";
import { MemoryCalendarRepository } from "./domain/memoryCalendarRepository.js";
import { PrismaCalendarRepository } from "./domain/prismaCalendarRepository.js";
import type { CalendarRepository } from "./domain/calendarRepository.js";
import { MemoryPushRepository } from "./domain/memoryPushRepository.js";
import { PrismaPushRepository } from "./domain/prismaPushRepository.js";
import { MemoryFamilyActivityRepository } from "./domain/memoryFamilyActivityRepository.js";
import { PrismaFamilyActivityRepository } from "./domain/prismaFamilyActivityRepository.js";
import { loadOrCreateVapidKeys, PushService, WebPushSender } from "./services/pushService.js";
import { ReminderDispatcher, startReminderScheduler } from "./services/reminderDispatcher.js";

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
const transactionRepo: TransactionRepository = useMemoryAuth
  ? new MemoryTransactionRepository()
  : new PrismaTransactionRepository(prisma);
const recurringDepositRepo: RecurringDepositRepository = useMemoryAuth
  ? new MemoryRecurringDepositRepository()
  : new PrismaRecurringDepositRepository(prisma);
const pushRepo = useMemoryAuth ? new MemoryPushRepository() : new PrismaPushRepository(prisma);
const activityRepo = useMemoryAuth
  ? new MemoryFamilyActivityRepository()
  : new PrismaFamilyActivityRepository(prisma);
const vapidSubject =
  process.env.VAPID_SUBJECT ??
  (process.env.WEBAUTHN_ORIGIN
    ? `mailto:noreply@${new URL(process.env.WEBAUTHN_ORIGIN).hostname}`
    : "mailto:noreply@localhost");
const vapidKeys = loadOrCreateVapidKeys(
  process.env.VAPID_FILE ?? resolve(__dirname, "../../30_data/vapid.json"),
  vapidSubject,
);
const calendarRepo: CalendarRepository = useMemoryAuth
  ? new MemoryCalendarRepository()
  : new PrismaCalendarRepository(prisma);
const photoRepo: PhotoRepository = useMemoryAuth
  ? new MemoryPhotoRepository()
  : new PrismaPhotoRepository(prisma);
const icloudAlbumRepo: FamilyIcloudAlbumRepository = useMemoryAuth
  ? new MemoryFamilyIcloudAlbumRepository()
  : new PrismaFamilyIcloudAlbumRepository(prisma);
let reminderDispatcher!: ReminderDispatcher;
const pushService = new PushService(pushRepo, vapidKeys, new WebPushSender(vapidKeys), () =>
  reminderDispatcher.tick(),
);
reminderDispatcher = new ReminderDispatcher(authRepo, calendarRepo, pushService);
const passkeyRepo = useMemoryAuth ? new MemoryPasskeyRepository() : new PrismaPasskeyRepository(prisma);
const inviteTokenRepo = useMemoryAuth
  ? new MemoryInviteTokenRepository()
  : new PrismaInviteTokenRepository(prisma);
const challengeStore = new ChallengeStore();
const documentScanStore = new DocumentScanStore(defaultDocumentScanDir());
const photoStore = new PhotoStore(defaultPhotoDir());
const albumCoverStore = new AlbumCoverStore(defaultAlbumCoverDir());
const app = createApp(store, {
  authRepo,
  assetRepo,
  transactionRepo,
  recurringDepositRepo,
  calendarRepo,
  photoRepo,
  photoStore,
  albumCoverStore,
  icloudAlbumRepo,
  subscriptionRepo,
  checklistRepo,
  documentRepo,
  documentScanStore,
  passkeyRepo,
  inviteTokenRepo,
  challengeStore,
  jwtSecret: JWT_SECRET,
  pushService,
  reminderDispatcher,
  activityRepo,
});

app.listen(PORT, () => {
  console.log(`[server] personal-app API listening on http://localhost:${PORT}`);
  console.log(`[server] persisting tasks to ${DATA_FILE}`);
  console.log(
    `[server] auth/family/assets/subscriptions/checklists/documents/calendar/photos/passkey/push routes enabled (JWT, store=${
      useMemoryAuth ? "memory" : "prisma"
    })`,
  );
  console.log(
    `[server] TZ=${process.env.TZ ?? "(unset)"} resolved=${Intl.DateTimeFormat().resolvedOptions().timeZone} commit=${process.env.GIT_COMMIT ?? "n/a"}`,
  );
  startReminderScheduler(reminderDispatcher);
  console.log("[server] calendar reminder dispatcher started");
});
