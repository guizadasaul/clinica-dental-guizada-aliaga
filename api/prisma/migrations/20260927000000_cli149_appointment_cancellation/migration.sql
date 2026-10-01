-- CLI-149: el doctor puede cancelar una cita. Aditiva: dos columnas nullable
-- nuevas, sin tocar datos existentes. El estado 'cancelled' no necesita
-- cambios de esquema (status es varchar sin CHECK) y cancelar libera el turno
-- solo, porque idx_one_active_appointment_slot e
-- idx_one_active_appointment_guest_phone solo cuentan held/confirmed.

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "cancelled_at" TIMESTAMPTZ(6),
ADD COLUMN     "cancelled_by" UUID;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
