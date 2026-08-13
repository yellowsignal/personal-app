-- Family activity feed for shared-content notifications
CREATE TYPE "FamilyActivityEntityType" AS ENUM ('CALENDAR_EVENT', 'DOCUMENT', 'CHECKLIST', 'ASSET', 'SUBSCRIPTION');

CREATE TABLE "family_activities" (
    "id" SERIAL NOT NULL,
    "family_id" INTEGER NOT NULL,
    "actor_user_id" INTEGER NOT NULL,
    "entity_type" "FamilyActivityEntityType" NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_activities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "family_activity_reads" (
    "id" SERIAL NOT NULL,
    "activity_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_activity_reads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "family_activities_family_id_created_at_idx" ON "family_activities"("family_id", "created_at");
CREATE INDEX "family_activities_entity_type_entity_id_idx" ON "family_activities"("entity_type", "entity_id");
CREATE INDEX "family_activity_reads_user_id_idx" ON "family_activity_reads"("user_id");
CREATE UNIQUE INDEX "family_activity_reads_activity_id_user_id_key" ON "family_activity_reads"("activity_id", "user_id");

ALTER TABLE "family_activities" ADD CONSTRAINT "family_activities_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "family_activities" ADD CONSTRAINT "family_activities_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "family_activity_reads" ADD CONSTRAINT "family_activity_reads_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "family_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "family_activity_reads" ADD CONSTRAINT "family_activity_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
