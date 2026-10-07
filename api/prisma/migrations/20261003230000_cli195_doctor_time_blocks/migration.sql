-- CLI-195: horarios que el doctor aparta de su agenda (una emergencia, un
-- curso, un acontecimiento). Mientras dura el bloqueo, esas horas no se
-- ofrecen en la reserva pública ni se pueden agendar pacientes encima.
CREATE TABLE "doctor_time_blocks" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "doctor_id"  UUID NOT NULL,
  "starts_at"  TIMESTAMPTZ(6) NOT NULL,
  "ends_at"    TIMESTAMPTZ(6) NOT NULL,
  "reason"     VARCHAR(200),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "doctor_time_blocks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "doctor_time_blocks_range_check" CHECK ("ends_at" > "starts_at"),
  CONSTRAINT "doctor_time_blocks_doctor_id_fkey" FOREIGN KEY ("doctor_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE INDEX "doctor_time_blocks_doctor_id_starts_at_idx"
  ON "doctor_time_blocks"("doctor_id", "starts_at");

-- RLS en la tabla nueva, como toda tabla de `public` (ver
-- 20260925000000_enable_rls_all_public_tables): sin policies, solo el backend
-- (dueño de la tabla) la lee y escribe.
ALTER TABLE "doctor_time_blocks" ENABLE ROW LEVEL SECURITY;
