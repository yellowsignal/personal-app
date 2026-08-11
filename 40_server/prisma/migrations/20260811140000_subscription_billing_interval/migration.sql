-- AlterTable
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');

ALTER TABLE "subscriptions" ADD COLUMN "billing_interval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY';
ALTER TABLE "subscriptions" ADD COLUMN "billing_month" INTEGER;

CREATE INDEX "subscriptions_billing_interval_idx" ON "subscriptions"("billing_interval");
