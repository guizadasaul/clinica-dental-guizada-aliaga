// Espejo de api/src/shared/validators/clinical-options.ts — cambiar los dos
// juntos. Única fuente de los códigos cerrados del wizard de paciente: antes
// se repetían sueltos (o directamente no existían) en cada step/template.

/** El <select> ya usa estos códigos ASCII estables — no cambian con CLI-39. */
export const SEXES = ['masculino', 'femenino', 'otro'] as const;
export type Sex = (typeof SEXES)[number];

// Alineado con el CHECK patients_document_type_check (CLI-54). La unicidad
// real es (document_type, dni) — un pasaporte y una CI pueden coincidir en
// número sin ser la misma persona.
export const DOCUMENT_TYPES = ['ci', 'pasaporte', 'nit'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

// Códigos estables en vez del texto visible con tildes que se guardaba hoy
// ("1 vez al día"). hygiene_habits está vacía (CLI-39): no hay datos que
// migrar para este cambio.
export const BRUSHING_FREQUENCIES = [
  'once_daily',
  'twice_daily',
  'thrice_daily',
  'more_than_thrice',
  'occasionally',
] as const;
export type BrushingFrequency = (typeof BRUSHING_FREQUENCIES)[number];

// Alineado con el CHECK odontogram_entries_tooth_type_check
// (prisma/migrations/20260623_fix_odontogram_constraints).
export const TOOTH_TYPES = ['permanent', 'deciduous'] as const;
export type ToothType = (typeof TOOTH_TYPES)[number];

// Valores posibles cuando el diagnóstico elegido tiene modifier =
// 'black_class' (clasificación de Black para caries y obturaciones). Fijos
// por la odontología — no configurables desde el catálogo (CLI-40).
export const BLACK_CLASSES = [
  'clase_i',
  'clase_ii',
  'clase_iii',
  'clase_iv',
  'clase_v',
] as const;
export type BlackClass = (typeof BLACK_CLASSES)[number];

// Valores posibles cuando el diagnóstico tiene modifier = 'mobility_grade'
// (grados de movilidad dental I–IV).
export const MOBILITY_GRADES = [
  'grado_i',
  'grado_ii',
  'grado_iii',
  'grado_iv',
] as const;
export type MobilityGrade = (typeof MOBILITY_GRADES)[number];

// Alineado con el CHECK odontogram_entries_tooth_condition_check
// (prisma/migrations/20260623_add_tooth_condition).
export const TOOTH_CONDITIONS = [
  'sano',
  'caries',
  'restauracion',
  'corona',
  'ausente',
  'extraccion',
  'endodoncia',
  'fractura',
  'periodoncia',
  'otro',
] as const;
export type ToothCondition = (typeof TOOTH_CONDITIONS)[number];
