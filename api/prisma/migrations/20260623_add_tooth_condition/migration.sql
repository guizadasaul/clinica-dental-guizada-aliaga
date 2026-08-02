-- Revert diagnosis_type constraint to the correct domain values.
-- The previous migration incorrectly replaced 'presuntivo'/'definitivo' with tooth condition values.
-- In dentistry, diagnosis_type refers to the epistemological certainty of the diagnosis,
-- not the visual condition of the tooth.

ALTER TABLE public.odontogram_entries
  DROP CONSTRAINT IF EXISTS odontogram_entries_diagnosis_type_check;

ALTER TABLE public.odontogram_entries
  ADD CONSTRAINT odontogram_entries_diagnosis_type_check
    CHECK (diagnosis_type = ANY (ARRAY['presuntivo','definitivo']));

-- Add tooth_condition column to store the visual/clinical state of each tooth.
-- This separates the "what" (condition) from the "how certain" (diagnosis type).

ALTER TABLE public.odontogram_entries
  ADD COLUMN IF NOT EXISTS tooth_condition VARCHAR(30) NOT NULL DEFAULT 'sano';

ALTER TABLE public.odontogram_entries
  ADD CONSTRAINT odontogram_entries_tooth_condition_check
    CHECK (tooth_condition = ANY (ARRAY[
      'sano','caries','restauracion','corona',
      'ausente','extraccion','endodoncia',
      'fractura','periodoncia','otro'
    ]));
