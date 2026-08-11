-- AlterTable
ALTER TABLE "assets" ADD COLUMN "stock_market" VARCHAR(10);
ALTER TABLE "assets" ADD COLUMN "quantity" DECIMAL(18, 6);
ALTER TABLE "assets" ADD COLUMN "current_price" DECIMAL(15, 4);
ALTER TABLE "assets" ALTER COLUMN "stock_code" TYPE VARCHAR(32);
