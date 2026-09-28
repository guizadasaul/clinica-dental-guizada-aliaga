-- 1. Contacto de emergencia: nombres y apellidos en columnas separadas, igual
--    que el propio paciente (first_name / last_name_*).
ALTER TABLE "patients"
  ADD COLUMN "emergency_contact_first_name" VARCHAR(100),
  ADD COLUMN "emergency_contact_last_name" VARCHAR(100);

-- Backfill: el nombre completo no dice dónde terminan los nombres — se toma
-- la primera palabra como nombre y el resto como apellidos. El doctor lo
-- corrige desde la ficha si el corte no es el correcto.
UPDATE "patients"
SET
  "emergency_contact_first_name" = LEFT(split_part(btrim("emergency_contact_name"), ' ', 1), 100),
  "emergency_contact_last_name" = LEFT(
    NULLIF(btrim(substr(btrim("emergency_contact_name"), length(split_part(btrim("emergency_contact_name"), ' ', 1)) + 1)), ''),
    100
  )
WHERE "emergency_contact_name" IS NOT NULL AND btrim("emergency_contact_name") <> '';

ALTER TABLE "patients" DROP COLUMN "emergency_contact_name";

-- 2. Extensión/complemento de la CI boliviana (ej. "LP", "1A"). Opcional y
--    solo tiene sentido para CI. No entra en patients_document_type_dni_key:
--    con NULLs distintos en Postgres, sumarla a la unicidad dejaría pasar dos
--    "CI 123" sin extensión.
ALTER TABLE "patients" ADD COLUMN "document_extension" VARCHAR(12);

ALTER TABLE "patients"
  ADD CONSTRAINT "patients_document_extension_ci_check"
    CHECK ("document_extension" IS NULL OR "document_type" = 'ci');
