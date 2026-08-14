CREATE TABLE "family_icloud_albums" (
    "id" SERIAL NOT NULL,
    "family_id" INTEGER NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "name" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_icloud_albums_pkey" PRIMARY KEY ("id")
);

INSERT INTO "family_icloud_albums" ("family_id", "url", "created_at")
SELECT "id", "icloud_shared_album_url", CURRENT_TIMESTAMP
FROM "families"
WHERE "icloud_shared_album_url" IS NOT NULL AND btrim("icloud_shared_album_url") <> '';

CREATE UNIQUE INDEX "family_icloud_albums_family_id_url_key" ON "family_icloud_albums"("family_id", "url");
CREATE INDEX "family_icloud_albums_family_id_idx" ON "family_icloud_albums"("family_id");

ALTER TABLE "family_icloud_albums"
    ADD CONSTRAINT "family_icloud_albums_family_id_fkey"
    FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "families" DROP COLUMN "icloud_shared_album_url";
