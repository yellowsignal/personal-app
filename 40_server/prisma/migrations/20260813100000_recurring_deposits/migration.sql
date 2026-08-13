-- CreateTable
CREATE TABLE "recurring_deposits" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "family_id" INTEGER,
    "asset_id" INTEGER NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL,
    "billing_interval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
    "billing_month" INTEGER,
    "billing_date" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_applied_on" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_deposits_user_id_idx" ON "recurring_deposits"("user_id");

-- CreateIndex
CREATE INDEX "recurring_deposits_asset_id_idx" ON "recurring_deposits"("asset_id");

-- CreateIndex
CREATE INDEX "recurring_deposits_is_active_idx" ON "recurring_deposits"("is_active");

-- AddForeignKey
ALTER TABLE "recurring_deposits" ADD CONSTRAINT "recurring_deposits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_deposits" ADD CONSTRAINT "recurring_deposits_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_deposits" ADD CONSTRAINT "recurring_deposits_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
