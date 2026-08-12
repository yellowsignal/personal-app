ALTER TABLE "documents" ADD COLUMN "category" VARCHAR(50) NOT NULL DEFAULT 'other';

UPDATE "documents"
SET "category" = 'medical'
WHERE "doc_type" LIKE '%診察券%' OR "doc_type" LIKE '%診察%';

UPDATE "documents"
SET "category" = 'insurance'
WHERE "category" = 'other'
  AND ("doc_type" LIKE '%保険証%' OR "doc_type" LIKE '%健康保険%');

UPDATE "documents"
SET "category" = 'certificate'
WHERE "category" = 'other'
  AND ("doc_type" LIKE '%자격증%' OR "doc_type" LIKE '%資格%');

UPDATE "documents"
SET "category" = 'card'
WHERE "category" = 'other'
  AND (
    "doc_type" LIKE '%신용%'
    OR "doc_type" LIKE '%체크%'
    OR "doc_type" LIKE '%クレジット%'
    OR "doc_type" LIKE '%デビット%'
    OR "doc_type" ILIKE '%credit%'
    OR "doc_type" ILIKE '%debit%'
  );

UPDATE "documents"
SET "category" = 'id'
WHERE "category" = 'other'
  AND (
    "doc_type" LIKE '%재류%'
    OR "doc_type" LIKE '%在留%'
    OR "doc_type" LIKE '%여권%'
    OR "doc_type" LIKE '%passport%'
    OR "doc_type" LIKE '%運転%'
    OR "doc_type" LIKE '%면허%'
    OR "doc_type" LIKE '%주민%'
    OR "doc_type" LIKE '%マイナンバー%'
    OR "doc_type" LIKE '%住民%'
  );

CREATE INDEX "documents_category_idx" ON "documents"("category");
