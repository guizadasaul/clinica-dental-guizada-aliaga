-- CLI-261: tratamientos que cubre un pago en efectivo que registra el doctor
-- eligiéndolos en Finanzas (cada uno por su saldo completo). Igual que
-- quote_qr_charge_lines (CLI-218): el pago queda asignado a estas líneas en
-- vez de repartirse en orden. Cada línea es una fila suelta de quote_items o
-- un grupo multi-diente (application_groups), nunca las dos cosas.

-- CreateTable
CREATE TABLE "payment_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "quote_item_id" UUID,
    "application_group_id" UUID,
    "amount" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_lines_one_target_check"
        CHECK (num_nonnulls("quote_item_id", "application_group_id") = 1),
    CONSTRAINT "payment_lines_amount_check" CHECK ("amount" > 0)
);

-- CreateIndex
CREATE INDEX "idx_payment_lines_payment" ON "payment_lines"("payment_id");

-- AddForeignKey
ALTER TABLE "payment_lines" ADD CONSTRAINT "payment_lines_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payment_lines" ADD CONSTRAINT "payment_lines_quote_item_id_fkey" FOREIGN KEY ("quote_item_id") REFERENCES "quote_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payment_lines" ADD CONSTRAINT "payment_lines_application_group_id_fkey" FOREIGN KEY ("application_group_id") REFERENCES "application_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- RLS como toda tabla de `public` (ver 20260925000000_enable_rls_all_public_tables):
-- sin policies, solo el backend la lee y escribe.
ALTER TABLE "payment_lines" ENABLE ROW LEVEL SECURITY;

-- CLI-261: quién generó cada QR. Hasta ahora el del paciente se reconocía por
-- tener líneas (CLI-218); desde CLI-261 el del doctor también las tiene, así
-- que se marca el origen. Los QR anteriores sin líneas son todos del doctor.
ALTER TABLE "quote_qr_charges" ADD COLUMN "origin" VARCHAR(10) NOT NULL DEFAULT 'patient';
UPDATE "quote_qr_charges" c SET "origin" = 'doctor'
WHERE NOT EXISTS (SELECT 1 FROM "quote_qr_charge_lines" l WHERE l."qr_charge_id" = c."id");
ALTER TABLE "quote_qr_charges" ADD CONSTRAINT "quote_qr_charges_origin_check" CHECK ("origin" IN ('patient', 'doctor'));
