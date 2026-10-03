-- CLI-184: baja lógica de pacientes. Nunca se borra la fila: la ficha queda
-- marcada con deleted_at / deleted_by y la persona con users.is_active = false.

ALTER TABLE "patients"
  ADD COLUMN "deleted_at" TIMESTAMPTZ(6),
  ADD COLUMN "deleted_by" UUID;

ALTER TABLE "patients"
  ADD CONSTRAINT "patients_deleted_by_fkey"
  FOREIGN KEY ("deleted_by") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

-- Un paciente eliminado se puede volver a registrar como uno nuevo con el
-- mismo documento o correo: la unicidad solo rige entre los que siguen activos.
ALTER TABLE "patients" DROP CONSTRAINT "patients_document_type_dni_key";
CREATE UNIQUE INDEX "patients_document_type_dni_key"
  ON "patients"("document_type", "dni") WHERE ("deleted_at" IS NULL);

DROP INDEX "users_email_key";
CREATE UNIQUE INDEX "users_email_key"
  ON "users"("email") WHERE ("is_active");
