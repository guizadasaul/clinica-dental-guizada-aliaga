-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "baneco_qr_id" VARCHAR(50),
ADD COLUMN     "baneco_qr_image" TEXT,
ADD COLUMN     "baneco_transaction_id" VARCHAR(50),
ADD COLUMN     "paid_at" TIMESTAMPTZ(6),
ADD COLUMN     "payment_amount" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "patients" ALTER COLUMN "birth_date" DROP NOT NULL;

-- AlterTable
ALTER TABLE "treatments" ADD COLUMN     "is_default_consultation" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "appointments_baneco_qr_id_key" ON "appointments"("baneco_qr_id");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_baneco_transaction_id_key" ON "appointments"("baneco_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_one_default_consultation" ON "treatments"("is_default_consultation") WHERE (is_default_consultation = true);
