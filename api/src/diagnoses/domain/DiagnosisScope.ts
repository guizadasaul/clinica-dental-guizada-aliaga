/** A cuántas piezas se aplica un diagnóstico. `general` no cuelga de ningún diente. */
export const DIAGNOSIS_SCOPES = [
  'single_tooth',
  'multiple_teeth',
  'general',
] as const;
export type DiagnosisScope = (typeof DIAGNOSIS_SCOPES)[number];

/** Eje extra que califica al diagnóstico — fijo por la odontología. */
export const DIAGNOSIS_MODIFIERS = [
  'none',
  'black_class',
  'mobility_grade',
] as const;
export type DiagnosisModifier = (typeof DIAGNOSIS_MODIFIERS)[number];
