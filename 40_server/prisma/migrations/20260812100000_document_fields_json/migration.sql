-- Flexible document fields (multi-field support + encrypted secrets)
ALTER TABLE "documents" ADD COLUMN "fields_json" TEXT;
