// Espejo de frontend/src/app/shared/validation/clinical-options.ts — cambiar
// los dos juntos. Única fuente de los códigos cerrados del wizard de
// paciente: antes se repetían sueltos (o directamente no existían) en cada
// DTO/template, y @IsIn() se escribía a mano en cada lugar.

/** El <select> ya usa estos códigos ASCII estables — no cambian con CLI-39. */
export const SEXES = ['masculino', 'femenino', 'otro'] as const;
export type Sex = (typeof SEXES)[number];

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

// Certeza epistemológica del diagnóstico (no la condición visual del
// diente) — ver el comentario de
// prisma/migrations/20260623_add_tooth_condition/migration.sql.
export const DIAGNOSIS_TYPES = ['presuntivo', 'definitivo'] as const;
export type DiagnosisType = (typeof DIAGNOSIS_TYPES)[number];

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
