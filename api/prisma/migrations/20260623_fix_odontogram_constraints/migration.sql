-- Fix odontogram_entries check constraints.
-- The original constraints used incorrect values that didn't match the application domain.

-- diagnosis_type was constrained to ('presuntivo','definitivo') — wrong values.
-- tooth_type was constrained to ('permanent','temporary') — 'temporary' should be 'deciduous'.

ALTER TABLE public.odontogram_entries
  DROP CONSTRAINT IF EXISTS odontogram_entries_diagnosis_type_check,
  DROP CONSTRAINT IF EXISTS odontogram_entries_tooth_type_check;

ALTER TABLE public.odontogram_entries
  ADD CONSTRAINT odontogram_entries_diagnosis_type_check
    CHECK (diagnosis_type = ANY (ARRAY[
      'sano','caries','restauracion','corona',
      'ausente','extraccion','endodoncia',
      'fractura','periodoncia','otro'
    ])),
  ADD CONSTRAINT odontogram_entries_tooth_type_check
    CHECK (tooth_type = ANY (ARRAY['permanent','deciduous']));
