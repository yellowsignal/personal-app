-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "login_id" VARCHAR(255);
ALTER TABLE "subscriptions" ADD COLUMN "login_password_cipher" TEXT;
