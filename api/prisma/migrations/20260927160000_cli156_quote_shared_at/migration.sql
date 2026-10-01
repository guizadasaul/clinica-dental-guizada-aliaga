-- CLI-156: el presupuesto es un borrador hasta que el doctor lo comparte;
-- recién ahí el paciente lo ve (panel y chatbot). Aditiva: columna nullable.

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "shared_at" TIMESTAMPTZ(6);

-- Backfill: antes de CLI-156 el chatbot ya le mostraba al paciente todo
-- presupuesto con líneas, así que esos quedan compartidos para no ocultarle
-- nada que ya veía.
UPDATE "quotes" SET "shared_at" = "updated_at"
WHERE EXISTS (SELECT 1 FROM "quote_items" WHERE "quote_items"."quote_id" = "quotes"."id");
