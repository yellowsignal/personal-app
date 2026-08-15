-- Album list cache: cover bytes live on disk; meta columns here.
ALTER TABLE "family_icloud_albums" ADD COLUMN "name_locked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "family_icloud_albums" ADD COLUMN "cover_photo_id" VARCHAR(120);
ALTER TABLE "family_icloud_albums" ADD COLUMN "cover_mime" VARCHAR(80);
ALTER TABLE "family_icloud_albums" ADD COLUMN "photo_count" INTEGER;
ALTER TABLE "family_icloud_albums" ADD COLUMN "synced_at" TIMESTAMP(3);
