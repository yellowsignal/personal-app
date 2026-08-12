-- AlterTable
ALTER TABLE "checklist_items" ADD COLUMN "completed_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "checklist_items_completed_at_idx" ON "checklist_items"("completed_at");
