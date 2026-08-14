-- AlterTable
ALTER TABLE "tooth_procedures" ADD COLUMN     "application_group_id" UUID,
ALTER COLUMN "tooth_number" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "idx_tooth_procedures_application_group" ON "tooth_procedures"("application_group_id");

-- Corrige un bug preexistente (no introducido por esta migración): el CHECK
-- de diagnosis_type quedó con la lista de CONDICIONES tras
-- 20260623_fix_odontogram_constraints, no con los valores reales que manda
-- el DTO/frontend (presuntivo/definitivo). No se había detectado porque
-- odontogram_entries está vacía en dev — cualquier insert lo viola tal como
-- está. CLI-15 necesita insertar entries programáticamente para tratamientos
-- de arcada/boca completa, así que se corrige acá.
ALTER TABLE "odontogram_entries" DROP CONSTRAINT IF EXISTS "odontogram_entries_diagnosis_type_check";
ALTER TABLE "odontogram_entries" ADD CONSTRAINT "odontogram_entries_diagnosis_type_check"
  CHECK (diagnosis_type = ANY (ARRAY['presuntivo', 'definitivo']));
