-- CLI-50: medical_history tenía tres problemas de 1FN encadenados —
-- 10 condiciones como 10 columnas booleanas paralelas, medicación en un
-- texto libre concatenado y gestación como una cadena interpretable a ojo
-- ("2do trimestre"). Ninguno permitía lo que la práctica clínica necesita:
-- agregar una condición sin migrar, consultar quién toma un fármaco, o
-- derivar el trimestre de forma confiable.

-- 1. Catálogo de condiciones médicas (fijo por catálogo clínico, crece con
--    una fila — agrega asma y epilepsia, las dos contraindicaciones de
--    anestesia más comunes que faltaban).
CREATE TABLE "medical_conditions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "display_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "medical_conditions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "medical_conditions_code_key" ON "medical_conditions"("code");

INSERT INTO "medical_conditions" ("code", "name", "display_order") VALUES
    ('alergias',            'Alergias',                  1),
    ('problemas_renales',   'Problemas renales',         2),
    ('ulceras',             'Úlceras',                   3),
    ('reumatismo',          'Reumatismo',                4),
    ('problemas_cardiacos', 'Problemas cardíacos',       5),
    ('diabetes',            'Diabetes',                  6),
    ('hipertension',        'Hipertensión',               7),
    ('hemorragias',         'Hemorragias',               8),
    ('anemia',              'Anemia',                    9),
    ('its',                 'ITS',                       10),
    ('asma',                'Asma',                      11),
    ('epilepsia',           'Epilepsia',                 12);

-- 2. Tabla puente: condiciones registradas por paciente, con cuándo se
--    diagnosticó y notas — datos que los 10 booleanos no tenían dónde vivir.
CREATE TABLE "patient_medical_conditions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "medical_condition_id" UUID NOT NULL,
    "diagnosed_at" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "patient_medical_conditions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "idx_patient_medical_conditions_unique" ON "patient_medical_conditions"("patient_id", "medical_condition_id");
CREATE INDEX "idx_patient_medical_conditions_patient" ON "patient_medical_conditions"("patient_id");

ALTER TABLE "patient_medical_conditions" ADD CONSTRAINT "patient_medical_conditions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "patient_medical_conditions" ADD CONSTRAINT "patient_medical_conditions_medical_condition_id_fkey" FOREIGN KEY ("medical_condition_id") REFERENCES "medical_conditions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- 3. Backfill: una fila por booleano en true. Verificado contra la base
--    real antes de escribir esta migración: 3 filas de medical_history en
--    total, con kidney_problems, diabetes y hemorrhages en true una vez
--    cada uno (el resto de columnas están en false en las 3 filas) — no hay
--    combinaciones raras que revisar a mano.
INSERT INTO "patient_medical_conditions" ("patient_id", "medical_condition_id")
SELECT mh."patient_id", mc."id" FROM "medical_history" mh, "medical_conditions" mc
WHERE mc."code" = 'alergias' AND mh."has_allergies" = true;
INSERT INTO "patient_medical_conditions" ("patient_id", "medical_condition_id")
SELECT mh."patient_id", mc."id" FROM "medical_history" mh, "medical_conditions" mc
WHERE mc."code" = 'problemas_renales' AND mh."kidney_problems" = true;
INSERT INTO "patient_medical_conditions" ("patient_id", "medical_condition_id")
SELECT mh."patient_id", mc."id" FROM "medical_history" mh, "medical_conditions" mc
WHERE mc."code" = 'ulceras' AND mh."ulcers" = true;
INSERT INTO "patient_medical_conditions" ("patient_id", "medical_condition_id")
SELECT mh."patient_id", mc."id" FROM "medical_history" mh, "medical_conditions" mc
WHERE mc."code" = 'reumatismo' AND mh."rheumatism" = true;
INSERT INTO "patient_medical_conditions" ("patient_id", "medical_condition_id")
SELECT mh."patient_id", mc."id" FROM "medical_history" mh, "medical_conditions" mc
WHERE mc."code" = 'problemas_cardiacos' AND mh."heart_problems" = true;
INSERT INTO "patient_medical_conditions" ("patient_id", "medical_condition_id")
SELECT mh."patient_id", mc."id" FROM "medical_history" mh, "medical_conditions" mc
WHERE mc."code" = 'diabetes' AND mh."diabetes" = true;
INSERT INTO "patient_medical_conditions" ("patient_id", "medical_condition_id")
SELECT mh."patient_id", mc."id" FROM "medical_history" mh, "medical_conditions" mc
WHERE mc."code" = 'hipertension' AND mh."hypertension" = true;
INSERT INTO "patient_medical_conditions" ("patient_id", "medical_condition_id")
SELECT mh."patient_id", mc."id" FROM "medical_history" mh, "medical_conditions" mc
WHERE mc."code" = 'hemorragias' AND mh."hemorrhages" = true;
INSERT INTO "patient_medical_conditions" ("patient_id", "medical_condition_id")
SELECT mh."patient_id", mc."id" FROM "medical_history" mh, "medical_conditions" mc
WHERE mc."code" = 'anemia' AND mh."anemia" = true;
INSERT INTO "patient_medical_conditions" ("patient_id", "medical_condition_id")
SELECT mh."patient_id", mc."id" FROM "medical_history" mh, "medical_conditions" mc
WHERE mc."code" = 'its' AND mh."sti" = true;

-- 4. Medicación en campos separados. current_medications está vacío en las
--    3 filas existentes (verificado), así que no hay texto libre real que
--    migrar — este INSERT es defensivo (documenta la regla para el futuro)
--    y no mueve ninguna fila hoy: guarda el texto completo tal cual en
--    drug_name porque no se puede separar fármaco/dosis/frecuencia de forma
--    confiable de forma automática; una revisión humana en la próxima
--    consulta del paciente lo divide en filas reales.
CREATE TABLE "patient_medications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "drug_name" VARCHAR(150) NOT NULL,
    "dose" VARCHAR(50),
    "frequency" VARCHAR(100),
    "started_at" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "patient_medications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_patient_medications_patient" ON "patient_medications"("patient_id");
CREATE INDEX "idx_patient_medications_drug_name" ON "patient_medications"("drug_name");
ALTER TABLE "patient_medications" ADD CONSTRAINT "patient_medications_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

INSERT INTO "patient_medications" ("patient_id", "drug_name")
SELECT "patient_id", trim("current_medications") FROM "medical_history"
WHERE "current_medications" IS NOT NULL AND trim("current_medications") <> '';

-- 5. gestation_period (texto libre, "2do trimestre") → gestation_lmp_date
--    (fecha real, trimestre derivado en código). Vacío en las 3 filas
--    existentes (verificado) — no hay texto que convertir ni perder.
ALTER TABLE "medical_history" ADD COLUMN "gestation_lmp_date" DATE;

-- 6. Ya migrados, se eliminan las columnas reemplazadas.
ALTER TABLE "medical_history" DROP COLUMN "has_allergies";
ALTER TABLE "medical_history" DROP COLUMN "kidney_problems";
ALTER TABLE "medical_history" DROP COLUMN "ulcers";
ALTER TABLE "medical_history" DROP COLUMN "rheumatism";
ALTER TABLE "medical_history" DROP COLUMN "heart_problems";
ALTER TABLE "medical_history" DROP COLUMN "diabetes";
ALTER TABLE "medical_history" DROP COLUMN "hypertension";
ALTER TABLE "medical_history" DROP COLUMN "hemorrhages";
ALTER TABLE "medical_history" DROP COLUMN "anemia";
ALTER TABLE "medical_history" DROP COLUMN "sti";
ALTER TABLE "medical_history" DROP COLUMN "current_medications";
ALTER TABLE "medical_history" DROP COLUMN "gestation_period";
