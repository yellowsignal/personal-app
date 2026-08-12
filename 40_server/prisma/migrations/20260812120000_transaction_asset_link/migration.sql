-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "asset_id" INTEGER;
ALTER TABLE "transactions" ADD COLUMN "balance_after" DECIMAL(15,2);

-- CreateIndex
CREATE INDEX "transactions_asset_id_idx" ON "transactions"("asset_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
