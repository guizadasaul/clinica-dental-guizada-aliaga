-- CLI-159: cobro de presupuestos con QR BANECO y verificación manual (botón
-- "Verificar pago", sin polling). Aditiva: tabla nueva, sin tocar datos.

-- CreateTable
CREATE TABLE "quote_qr_charges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quote_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "baneco_qr_id" VARCHAR(50) NOT NULL,
    "baneco_transaction_id" VARCHAR(50) NOT NULL,
    "qr_image" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "payment_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_qr_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quote_qr_charges_baneco_qr_id_key" ON "quote_qr_charges"("baneco_qr_id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_qr_charges_baneco_transaction_id_key" ON "quote_qr_charges"("baneco_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "quote_qr_charges_payment_id_key" ON "quote_qr_charges"("payment_id");

-- CreateIndex
CREATE INDEX "idx_quote_qr_charges_quote" ON "quote_qr_charges"("quote_id");

-- AddForeignKey
ALTER TABLE "quote_qr_charges" ADD CONSTRAINT "quote_qr_charges_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "quote_qr_charges" ADD CONSTRAINT "quote_qr_charges_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

