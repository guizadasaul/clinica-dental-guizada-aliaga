-- CLI-218: tratamientos que cubre un QR que genera el paciente desde "Mi
-- presupuesto". Al pagarse, el pago queda asignado a estas líneas (en vez de
-- repartirse en orden). Cada línea es una fila suelta de quote_items o un
-- grupo multi-diente (application_groups), nunca las dos cosas.

-- CreateTable
CREATE TABLE "quote_qr_charge_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "qr_charge_id" UUID NOT NULL,
    "quote_item_id" UUID,
    "application_group_id" UUID,
    "amount" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_qr_charge_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "quote_qr_charge_lines_one_target_check"
        CHECK (num_nonnulls("quote_item_id", "application_group_id") = 1),
    CONSTRAINT "quote_qr_charge_lines_amount_check" CHECK ("amount" > 0)
);

-- CreateIndex
CREATE INDEX "idx_quote_qr_charge_lines_charge" ON "quote_qr_charge_lines"("qr_charge_id");

-- AddForeignKey
ALTER TABLE "quote_qr_charge_lines" ADD CONSTRAINT "quote_qr_charge_lines_qr_charge_id_fkey" FOREIGN KEY ("qr_charge_id") REFERENCES "quote_qr_charges"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "quote_qr_charge_lines" ADD CONSTRAINT "quote_qr_charge_lines_quote_item_id_fkey" FOREIGN KEY ("quote_item_id") REFERENCES "quote_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "quote_qr_charge_lines" ADD CONSTRAINT "quote_qr_charge_lines_application_group_id_fkey" FOREIGN KEY ("application_group_id") REFERENCES "application_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- RLS como toda tabla de `public` (ver 20260925000000_enable_rls_all_public_tables):
-- sin policies, solo el backend la lee y escribe.
ALTER TABLE "quote_qr_charge_lines" ENABLE ROW LEVEL SECURITY;
