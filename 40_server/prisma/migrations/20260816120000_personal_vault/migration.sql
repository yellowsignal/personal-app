CREATE TYPE "VaultCategory" AS ENUM ('LOGIN', 'PRODUCT_KEY', 'OTHER');

CREATE TABLE "vault_items" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "category" "VaultCategory" NOT NULL DEFAULT 'LOGIN',
    "url" VARCHAR(500),
    "login_id" VARCHAR(255),
    "secret_cipher" TEXT,
    "memo" VARCHAR(2000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vault_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vault_items_user_id_updated_at_idx" ON "vault_items"("user_id", "updated_at");

ALTER TABLE "vault_items" ADD CONSTRAINT "vault_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
