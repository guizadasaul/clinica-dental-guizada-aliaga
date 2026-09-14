-- CLI-53: tres problemas de integridad referencial resueltos juntos.

-- 1. application_group_id sin tabla padre — extiende application_groups
--    (creada en CLI-45 para quote_items) a tooth_procedures. Mismo bug: el
--    precio vivía en una fila arbitraria del grupo (la del diente de número
--    más bajo), el resto facturaba 0.

-- quote_id pasa a ser opcional: un grupo de tooth_procedures no cuelga de
-- ningún presupuesto (son procedimientos ya realizados, no un ítem de
-- cotización).
ALTER TABLE "application_groups" ALTER COLUMN "quote_id" DROP NOT NULL;

-- Backfill: los 2 grupos existentes de tooth_procedures se insertan en
-- application_groups reusando su application_group_id actual como PK del
-- nuevo grupo (así no hace falta tocar la columna en tooth_procedures) — el
-- precio real es el MAX de la fila que lo tenía (la de índice 0, la única
-- no-cero bajo el esquema viejo).
INSERT INTO "application_groups" ("id", "quote_id", "treatment_id", "unit_price", "subtotal", "currency", "exchange_rate", "created_at")
SELECT
  tp."application_group_id",
  NULL,
  (array_agg(tp."treatment_id"))[1],
  MAX(tp."price_charged"),
  MAX(tp."price_charged"),
  'BOB',
  NULL,
  MIN(tp."created_at")
FROM "tooth_procedures" tp
WHERE tp."application_group_id" IS NOT NULL
GROUP BY tp."application_group_id";

-- price_charged deja de ser obligatorio — NULL para las filas de un grupo
-- (el precio real vive en application_groups). Las filas sueltas
-- (single_tooth/general/arcadas) siguen guardando el suyo, sin cambios.
ALTER TABLE "tooth_procedures" ALTER COLUMN "price_charged" DROP NOT NULL;

UPDATE "tooth_procedures" SET "price_charged" = NULL WHERE "application_group_id" IS NOT NULL;

-- AddForeignKey: application_group_id pasa de UUID suelto a FK real, con
-- ON DELETE CASCADE — un grupo se borra como unidad, igual que quote_items.
ALTER TABLE "tooth_procedures" ADD CONSTRAINT "tooth_procedures_application_group_id_fkey" FOREIGN KEY ("application_group_id") REFERENCES "application_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- 2. testimonials.treatment es texto libre a propósito (el visitante escribe
--    su experiencia con sus palabras, a veces combinando varios tratamientos
--    — CLI-36). Se agrega treatment_code como referencia OPCIONAL al
--    catálogo real, sin tocar el campo de texto libre ni el formulario
--    público. Ningún flujo la completa todavía — queda lista para cuando
--    se decida enlazar testimonios a tratamientos reales.
ALTER TABLE "testimonials" ADD COLUMN "treatment_code" VARCHAR(50);

ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_treatment_code_fkey" FOREIGN KEY ("treatment_code") REFERENCES "treatments"("code") ON DELETE SET NULL ON UPDATE NO ACTION;

-- 3. xray_documents.google_drive_url era un atributo derivable de
--    google_drive_file_id (violación de 3FN) — se elimina. La tabla no tiene
--    código de aplicación todavía (0 filas, sin ningún módulo que la lea o
--    escriba), así que no hay nada que migrar ni ningún caller que romper.
ALTER TABLE "xray_documents" DROP COLUMN "google_drive_url";
