/**
 * Espejo de DOCTOR_COLOR_PALETTE (api/src/shared/doctor-color-palette.ts) —
 * cambiar uno implica revisar el otro. Colores para distinguir de quién es
 * cada turno en la agenda común (CLI-110).
 */
export const DOCTOR_COLOR_PALETTE = [
  '#2563eb',
  '#db2777',
  '#16a34a',
  '#ea580c',
  '#7c3aed',
  '#0891b2',
  '#ca8a04',
  '#dc2626',
] as const;

/** Color de un turno sin doctor con color cargado (no debería pasar, es la red de seguridad). */
export const FALLBACK_DOCTOR_COLOR = '#006879';
