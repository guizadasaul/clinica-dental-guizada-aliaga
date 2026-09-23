-- CLI-109: distinguir un diagnóstico hecho desde cero (el primero de un
-- paciente, o uno nuevo cuando vuelve tras un tiempo) de la corrección del
-- diagnóstico vigente. Aditiva: las versiones existentes quedan como
-- corrección salvo la primera de cada paciente, que es su diagnóstico.
-- CreateEnum
CREATE TYPE "DentalExamKind" AS ENUM ('diagnosis', 'correction');

-- AlterTable
ALTER TABLE "dental_exams" ADD COLUMN     "kind" "DentalExamKind" NOT NULL DEFAULT 'correction';

UPDATE "dental_exams" SET "kind" = 'diagnosis' WHERE "version" = 1;
