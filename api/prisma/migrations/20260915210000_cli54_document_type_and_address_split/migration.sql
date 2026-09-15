-- CLI-54: dos campos de la ficha del paciente que quedaron fuera de la
-- normalización de CLI-39.

-- 1. patients.dni era único sin decir de qué documento — un pasaporte que
--    coincida numéricamente con una CI choca contra el índice sin motivo
--    real. Lo que tiene que ser único es el PAR (tipo, número), no el
--    número solo.
ALTER TABLE "patients" ADD COLUMN "document_type" VARCHAR(20);

-- Backfill: las 4 filas existentes con dni tienen todas formato numérico de
-- CI boliviana (verificado contra la base real, ningún valor parece
-- pasaporte/NIT) — se asume 'ci', el documento por defecto en Bolivia.
UPDATE "patients" SET "document_type" = 'ci' WHERE "dni" IS NOT NULL;

DROP INDEX "patients_dni_key";
ALTER TABLE "patients" ADD CONSTRAINT "patients_document_type_dni_key" UNIQUE ("document_type", "dni");

-- document_type y dni viajan juntos: un documento sin tipo o un tipo sin
-- número son estados inconsistentes. Ambos NULL sigue siendo válido —
-- "paciente sin documento" es un estado real que hay que conservar (ver
-- prisma-booking-confirmation.repository.ts, que crea pacientes placeholder
-- sin dni).
ALTER TABLE "patients"
  ADD CONSTRAINT "patients_document_type_dni_pairing_check"
    CHECK (("document_type" IS NULL) = ("dni" IS NULL));

ALTER TABLE "patients"
  ADD CONSTRAINT "patients_document_type_check"
    CHECK ("document_type" IS NULL OR "document_type" = ANY (ARRAY['ci', 'pasaporte', 'nit']));

-- 2. address era un blob de texto obligatorio con calle, número, zona,
--    ciudad y referencias mezclados — imposible reportar por zona o
--    detectar direcciones duplicadas. Se separan zona/ciudad como campos
--    propios; address se queda con el resto (calle, número, referencias).
--    Backfill: las 4 filas existentes no tienen "Zona"/ciudad reconocible
--    dentro del texto libre (verificado contra la base real: "Av Heroinas
--    r24432", "Calle Falsa 123", etc.) — no hay nada seguro que extraer
--    automáticamente, quedan NULL hasta la próxima visita del paciente.
ALTER TABLE "patients" ADD COLUMN "zona" VARCHAR(100);
ALTER TABLE "patients" ADD COLUMN "ciudad" VARCHAR(100);
