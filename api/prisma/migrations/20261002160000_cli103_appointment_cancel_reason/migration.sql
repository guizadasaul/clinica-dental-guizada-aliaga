-- CLI-103: el motivo de cancelación pasa a columna propia. Hasta ahora
-- AppointmentsRepository.cancel lo agregaba como última línea de `notes`
-- ("Cancelada: <motivo>"), mezclado con las notas clínicas del turno.
ALTER TABLE "appointments" ADD COLUMN "cancel_reason" VARCHAR(200);

-- Backfill: mover esa última línea a la columna nueva y sacarla de `notes`.
UPDATE "appointments"
SET
  "cancel_reason" = substring("notes" from '(?:^|\n)Cancelada: ([^\n]*)$'),
  "notes" = NULLIF(regexp_replace("notes", '(^|\n)Cancelada: [^\n]*$', ''), '')
WHERE "status" = 'cancelled'
  AND "notes" ~ '(^|\n)Cancelada: [^\n]*$';
