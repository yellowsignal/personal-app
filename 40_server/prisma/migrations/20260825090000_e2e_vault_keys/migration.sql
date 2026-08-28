-- E2E vault key packages (client-side encryption)
CREATE TABLE IF NOT EXISTS "vault_key_packages" (
    "user_id" INTEGER NOT NULL,
    "family_id" INTEGER,
    "kdf_salt" VARCHAR(64) NOT NULL,
    "kdf_iterations" INTEGER NOT NULL,
    "personal_dek_wrapped" TEXT NOT NULL,
    "private_key_wrapped" TEXT NOT NULL,
    "public_key_jwk" TEXT NOT NULL,
    "family_dek_wrapped" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vault_key_packages_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE IF NOT EXISTS "family_dek_deliveries" (
    "id" SERIAL NOT NULL,
    "family_id" INTEGER NOT NULL,
    "to_user_id" INTEGER NOT NULL,
    "from_user_id" INTEGER NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_dek_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "family_dek_deliveries_to_user_id_key" ON "family_dek_deliveries"("to_user_id");
CREATE INDEX IF NOT EXISTS "vault_key_packages_family_id_idx" ON "vault_key_packages"("family_id");
CREATE INDEX IF NOT EXISTS "family_dek_deliveries_family_id_idx" ON "family_dek_deliveries"("family_id");

ALTER TABLE "vault_key_packages" DROP CONSTRAINT IF EXISTS "vault_key_packages_user_id_fkey";
ALTER TABLE "vault_key_packages" ADD CONSTRAINT "vault_key_packages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vault_key_packages" DROP CONSTRAINT IF EXISTS "vault_key_packages_family_id_fkey";
ALTER TABLE "vault_key_packages" ADD CONSTRAINT "vault_key_packages_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "family_dek_deliveries" DROP CONSTRAINT IF EXISTS "family_dek_deliveries_family_id_fkey";
ALTER TABLE "family_dek_deliveries" ADD CONSTRAINT "family_dek_deliveries_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "family_dek_deliveries" DROP CONSTRAINT IF EXISTS "family_dek_deliveries_to_user_id_fkey";
ALTER TABLE "family_dek_deliveries" ADD CONSTRAINT "family_dek_deliveries_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "family_dek_deliveries" DROP CONSTRAINT IF EXISTS "family_dek_deliveries_from_user_id_fkey";
ALTER TABLE "family_dek_deliveries" ADD CONSTRAINT "family_dek_deliveries_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
