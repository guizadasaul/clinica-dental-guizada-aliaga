-- CLI-40: reemplaza el catálogo inventado de "condición de diente" y el eje
-- presuntivo/definitivo por el catálogo real de diagnósticos de la clínica
-- (10 categorías, 37 diagnósticos), y guarda el examen dental como versiones
-- inmutables (append-only) en vez de sobrescribir odontogram_entries en cada
-- guardado del paso 5.

-- CreateEnum
CREATE TYPE "DiagnosisScope" AS ENUM ('single_tooth', 'multiple_teeth', 'general');
CREATE TYPE "DiagnosisModifier" AS ENUM ('none', 'black_class', 'mobility_grade');

-- CreateTable
CREATE TABLE "diagnosis_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "display_order" INTEGER NOT NULL,

    CONSTRAINT "diagnosis_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnoses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "scope" "DiagnosisScope" NOT NULL,
    "modifier" "DiagnosisModifier" NOT NULL DEFAULT 'none',
    "color" VARCHAR(7) NOT NULL,
    "display_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "diagnoses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dental_exams" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "recorded_by" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "change_reason" TEXT,
    "notes" TEXT,

    CONSTRAINT "dental_exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dental_exam_findings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exam_id" UUID NOT NULL,
    "diagnosis_id" UUID NOT NULL,
    "tooth_number" INTEGER,
    "tooth_type" VARCHAR(20),
    "application_group_id" UUID,
    "modifier_value" VARCHAR(20),
    "description" TEXT,
    "xray_requested" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "dental_exam_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "diagnosis_categories_code_key" ON "diagnosis_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "diagnoses_code_key" ON "diagnoses"("code");

-- CreateIndex
CREATE INDEX "idx_diagnoses_category" ON "diagnoses"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "dental_exams_patient_id_version_key" ON "dental_exams"("patient_id", "version");

-- CreateIndex
CREATE INDEX "idx_dental_exams_patient_version_desc" ON "dental_exams"("patient_id", "version" DESC);

-- CreateIndex
CREATE INDEX "idx_dental_exam_findings_exam" ON "dental_exam_findings"("exam_id");

-- CreateIndex
CREATE INDEX "idx_dental_exam_findings_exam_tooth" ON "dental_exam_findings"("exam_id", "tooth_number");

-- AddForeignKey
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "diagnosis_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dental_exams" ADD CONSTRAINT "dental_exams_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dental_exams" ADD CONSTRAINT "dental_exams_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dental_exam_findings" ADD CONSTRAINT "dental_exam_findings_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "dental_exams"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "dental_exam_findings" ADD CONSTRAINT "dental_exam_findings_diagnosis_id_fkey" FOREIGN KEY ("diagnosis_id") REFERENCES "diagnoses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Los diagnósticos ya cargados con el catálogo viejo (chart del paso 5,
-- treatment_id IS NULL) no mapean a ningún diagnóstico del catálogo nuevo y
-- son datos de prueba (confirmado) — se descartan. Las filas generadas por
-- createToothProcedure al aplicar un tratamiento de arcada/boca completa
-- (treatment_id NOT NULL) no se tocan: siguen siendo lo que lee el
-- treatment-scope-picker.
DELETE FROM "odontogram_entries" WHERE "treatment_id" IS NULL;

-- diagnosis_type era el eje presuntivo/definitivo que la clínica no usa.
ALTER TABLE "odontogram_entries" DROP CONSTRAINT IF EXISTS "odontogram_entries_diagnosis_type_check";
ALTER TABLE "odontogram_entries" DROP COLUMN "diagnosis_type";
