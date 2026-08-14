-- AlterTable
ALTER TABLE "quote_items" ADD COLUMN     "application_group_id" UUID,
ADD COLUMN     "currency" VARCHAR(3) NOT NULL DEFAULT 'BOB',
ADD COLUMN     "exchange_rate" DECIMAL(12,5);

-- CreateIndex
CREATE INDEX "idx_quote_items_quote" ON "quote_items"("quote_id");

-- CreateIndex
CREATE INDEX "idx_quote_items_application_group" ON "quote_items"("application_group_id");
