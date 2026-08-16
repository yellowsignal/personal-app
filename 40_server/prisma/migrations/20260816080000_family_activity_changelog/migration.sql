CREATE TYPE "FamilyActivityAction" AS ENUM ('CREATED', 'UPDATED', 'DELETED');

ALTER TABLE "family_activities"
  ADD COLUMN "action" "FamilyActivityAction" NOT NULL DEFAULT 'CREATED',
  ADD COLUMN "detail_json" TEXT;
