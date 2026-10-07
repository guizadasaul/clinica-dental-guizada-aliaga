-- CLI-226: la fila del presupuesto que cumple cada procedimiento registrado.
-- Una fila se cumple una sola vez (UNIQUE); si se borra la fila del
-- presupuesto, el procedimiento queda sin vincular.
ALTER TABLE "tooth_procedures" ADD COLUMN "quote_item_id" UUID;

CREATE UNIQUE INDEX "idx_tooth_procedures_quote_item" ON "tooth_procedures"("quote_item_id");

ALTER TABLE "tooth_procedures" ADD CONSTRAINT "tooth_procedures_quote_item_id_fkey" FOREIGN KEY ("quote_item_id") REFERENCES "quote_items"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
