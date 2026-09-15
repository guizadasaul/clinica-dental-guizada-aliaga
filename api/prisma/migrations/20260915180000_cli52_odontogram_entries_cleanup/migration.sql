-- CLI-52: desde CLI-40, odontogram_entries solo recibe filas que genera
-- createToothProcedure al aplicar un tratamiento de arcada/boca completa —
-- ya no guarda el diagnóstico del paso 5 (eso vive en dental_exam_findings).
-- Auditado contra la base real antes de esta migración: las 112 filas
-- existentes son 100% post-CLI-40 (treatment_id NOT NULL), diagnosis_description
-- solo repite treatments.name (3 valores distintos, uno por tratamiento
-- aplicado) y xray_requested está en false en las 112 — no hay ninguna fila
-- pre-CLI-40 con diagnóstico real que preservar ni migrar.

-- diagnosis_description ya no se escribe para las filas nuevas (redundante
-- con treatment_id, que ya permite llegar a treatments.name con un join).
ALTER TABLE "odontogram_entries" ALTER COLUMN "diagnosis_description" DROP NOT NULL;

-- xray_requested: remanente del flujo viejo, ninguna fila la puso nunca en
-- true.
ALTER TABLE "odontogram_entries" DROP COLUMN "xray_requested";
