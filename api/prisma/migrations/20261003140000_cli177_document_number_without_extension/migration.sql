-- CLI-177: el número de documento (CI, NIT o pasaporte) pasa a 5-12
-- caracteres, solo letras en mayúscula, números y guiones, y la extensión de
-- la CI deja de ser una columna aparte: va dentro del número con guion
-- ("1234567" + "LP" → "1234567-LP"). Decisión del usuario: las extensiones
-- ya guardadas se pegan, no se descartan.

-- 1. Pegar la extensión al número.
UPDATE "patients"
SET "dni" = "dni" || '-' || "document_extension"
WHERE "document_extension" IS NOT NULL
  AND "document_extension" <> ''
  AND "dni" IS NOT NULL;

-- 2. Nunca cortar un documento en silencio: si alguno no entra en el formato
-- nuevo, abortar (la migración entera se revierte) listando los ids, para
-- corregirlos a mano antes de volver a desplegar.
DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg("id"::text || ' (' || "dni" || ')', ', ')
    INTO bad
    FROM "patients"
   WHERE "dni" IS NOT NULL
     AND "dni" !~ '^[A-Z0-9][A-Z0-9-]{3,10}[A-Z0-9]$';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'CLI-177: hay documentos que no entran en 5-12 caracteres de letras, números y guiones: %', bad;
  END IF;
END $$;

-- 3. Sin columna de extensión.
ALTER TABLE "patients" DROP CONSTRAINT IF EXISTS "patients_document_extension_ci_check";
ALTER TABLE "patients" DROP COLUMN "document_extension";

-- 4. dni de hasta 12 caracteres, con el formato verificado en la base.
ALTER TABLE "patients" ALTER COLUMN "dni" TYPE VARCHAR(12);
ALTER TABLE "patients"
  ADD CONSTRAINT "patients_dni_format_check"
  CHECK ("dni" IS NULL OR "dni" ~ '^[A-Z0-9][A-Z0-9-]{3,10}[A-Z0-9]$');
