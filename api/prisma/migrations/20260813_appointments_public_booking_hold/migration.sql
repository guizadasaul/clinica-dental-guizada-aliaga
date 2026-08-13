-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "guest_full_name" VARCHAR(200),
ADD COLUMN     "guest_phone" VARCHAR(20),
ADD COLUMN     "hold_expires_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE UNIQUE INDEX "idx_one_active_appointment_slot" ON "appointments"("appointment_datetime") WHERE (((status)::text = 'held'::text) OR ((status)::text = 'confirmed'::text));
