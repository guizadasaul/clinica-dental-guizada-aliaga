-- CLI-39: normalizar campos del paciente y cerrar los enums que hoy son
-- texto libre, como última línea de defensa además de los DTOs.

-- 1. Normalizar a E.164 los teléfonos ya cargados (hoy conviven "77842665"
--    sin prefijo y "+59175473452" ya normalizado). IsE164Phone() en los
--    DTOs evita que entren más filas sin normalizar a partir de ahora.
UPDATE public.patients
   SET phone = '+591' || regexp_replace(phone, '\D', '', 'g')
 WHERE phone IS NOT NULL AND phone <> '' AND phone NOT LIKE '+%';

UPDATE public.patients
   SET emergency_contact_phone = '+591' || regexp_replace(emergency_contact_phone, '\D', '', 'g')
 WHERE emergency_contact_phone IS NOT NULL
   AND emergency_contact_phone <> ''
   AND emergency_contact_phone NOT LIKE '+%';

-- 2. Un examen clínico por paciente por día — createClinicalExam pasa a
--    upsert sobre esta clave (ver prisma-patients.repository.ts). La tabla
--    está vacía (0 filas), no hace falta limpiar duplicados antes.
ALTER TABLE public.clinical_exams
  ADD CONSTRAINT clinical_exams_patient_id_exam_date_key UNIQUE (patient_id, exam_date);

-- 3. CHECK constraints para los campos que se cierran con @IsIn() en los
--    DTOs (patients.sex, hygiene_habits.brushing_frequency) — última línea
--    de defensa si algo escribe fuera de la app. Mismo estilo que
--    odontogram_entries_tooth_condition_check
--    (prisma/migrations/20260623_add_tooth_condition/migration.sql). Las dos
--    tablas están sin datos fuera de los valores permitidos (sex es
--    NULL/vacío en las 4 filas actuales; hygiene_habits tiene 0 filas).
ALTER TABLE public.patients
  ADD CONSTRAINT patients_sex_check
    CHECK (sex IS NULL OR sex = ANY (ARRAY['masculino', 'femenino', 'otro']));

ALTER TABLE public.hygiene_habits
  ADD CONSTRAINT hygiene_habits_brushing_frequency_check
    CHECK (brushing_frequency IS NULL OR brushing_frequency = ANY (ARRAY[
      'once_daily', 'twice_daily', 'thrice_daily', 'more_than_thrice', 'occasionally'
    ]));
