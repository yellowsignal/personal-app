-- CreateTable
CREATE TABLE "company_calendars" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "source_url" VARCHAR(1000),
    "fiscal_year" INTEGER NOT NULL,
    "off_dates" JSONB NOT NULL,
    "parsed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_calendars_user_id_key" ON "company_calendars"("user_id");

-- AddForeignKey
ALTER TABLE "company_calendars" ADD CONSTRAINT "company_calendars_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
