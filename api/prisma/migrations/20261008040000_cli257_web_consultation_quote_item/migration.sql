-- CLI-257: la consulta que el paciente reserva y paga por la web pasa a su
-- presupuesto como una línea más, con el pago aplicado a esa línea.
--
-- appointments.quote_item_id liga la reserva con su línea (una por reserva);
-- payments.quote_item_id aplica el pago entero a esa línea en vez de
-- repartirlo FIFO entre los tratamientos más viejos. Las dos son nullable:
-- las citas y los pagos de siempre no cambian.
ALTER TABLE "appointments" ADD COLUMN "quote_item_id" UUID;

ALTER TABLE "payments" ADD COLUMN "quote_item_id" UUID;

CREATE UNIQUE INDEX "appointments_quote_item_id_key" ON "appointments"("quote_item_id");

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_quote_item_id_fkey" FOREIGN KEY ("quote_item_id") REFERENCES "quote_items"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "payments" ADD CONSTRAINT "payments_quote_item_id_fkey" FOREIGN KEY ("quote_item_id") REFERENCES "quote_items"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
