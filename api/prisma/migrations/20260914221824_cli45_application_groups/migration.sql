-- CLI-45: el precio de una aplicación multiple_teeth vivía en una fila
-- arbitraria de quote_items (la del diente de número más bajo), con el
-- resto de las filas del grupo facturando 0 — violación de 2FN. Se crea
-- application_groups como entidad propia para el precio del grupo.
--
-- No hay datos existentes que migrar: 0 filas de quote_items tienen
-- application_group_id seteado en la base al momento de esta migración.

-- CreateTable
CREATE TABLE "application_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quote_id" UUID NOT NULL,
    "treatment_id" UUID NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BOB',
    "exchange_rate" DECIMAL(12,5),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "application_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_application_groups_quote" ON "application_groups"("quote_id");

-- AddForeignKey
ALTER TABLE "application_groups" ADD CONSTRAINT "application_groups_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "application_groups" ADD CONSTRAINT "application_groups_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "treatments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AlterTable: unit_price/currency dejan de ser obligatorios en quote_items —
-- NULL cuando application_group_id está seteado (el precio vive en
-- application_groups). Las filas sueltas (single_tooth/general) siguen
-- guardando su propio precio, sin cambios.
ALTER TABLE "quote_items" ALTER COLUMN "unit_price" DROP NOT NULL;
ALTER TABLE "quote_items" ALTER COLUMN "currency" DROP NOT NULL;
ALTER TABLE "quote_items" ALTER COLUMN "currency" DROP DEFAULT;

-- AddForeignKey: application_group_id pasa de ser un UUID suelto a una FK
-- real. ON DELETE CASCADE porque un grupo se borra como unidad (ver
-- removeItemGroup) — borrar application_groups arrastra sus quote_items.
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_application_group_id_fkey" FOREIGN KEY ("application_group_id") REFERENCES "application_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
