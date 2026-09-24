-- CLI-119: tratamientos sugeridos por diagnóstico. Aditiva: tabla nueva, el
-- contenido lo carga el seed por códigos (upsertDiagnosisTreatmentSuggestions).

-- CreateTable
CREATE TABLE "diagnosis_treatment_suggestions" (
    "diagnosis_id" UUID NOT NULL,
    "treatment_id" UUID NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "diagnosis_treatment_suggestions_pkey" PRIMARY KEY ("diagnosis_id","treatment_id")
);

-- AddForeignKey
ALTER TABLE "diagnosis_treatment_suggestions" ADD CONSTRAINT "diagnosis_treatment_suggestions_diagnosis_id_fkey" FOREIGN KEY ("diagnosis_id") REFERENCES "diagnoses"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "diagnosis_treatment_suggestions" ADD CONSTRAINT "diagnosis_treatment_suggestions_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "treatments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

