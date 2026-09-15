-- DropIndex
DROP INDEX "idx_one_active_appointment_web";

-- DropIndex
DROP INDEX "idx_one_active_appointment_wa";

-- CreateIndex
CREATE UNIQUE INDEX "idx_one_active_appointment_guest_phone" ON "appointments"("guest_phone") WHERE ((((status)::text = 'held'::text) OR ((status)::text = 'confirmed'::text)) AND (guest_phone IS NOT NULL));
