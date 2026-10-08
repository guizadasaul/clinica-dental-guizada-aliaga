import type { TreatmentApplicationType } from '../../features/treatments/models/treatment.model';

// Piezas permanentes por arcada, en el orden del odontograma. Los tratamientos
// de arcada y boca completa se registran sobre estas (no sobre las de leche).
// Antes acá vivía también el dibujo de dientes del presupuesto, reemplazado
// por el odontograma compartido (CLI-256).
const UPPER_TEETH: readonly number[] = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_TEETH: readonly number[] = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

/**
 * Espejo frontend de `teethForApplicationType` en
 * api/src/treatments/domain/TreatmentApplicationType.ts — cambiar uno
 * implica revisar el otro. Devuelve [] para cualquier alcance que no sea arcada/boca
 * completa: single_tooth/multiple_teeth dependen de la selección del
 * doctor, y el resto (general, soft_tissue, frenulum, prosthesis,
 * orthodontic, unit, box) no lleva diente.
 */
export function teethForApplicationType(
  applicationType: TreatmentApplicationType,
): number[] {
  switch (applicationType) {
    case 'upper_arch':
      return [...UPPER_TEETH];
    case 'lower_arch':
      return [...LOWER_TEETH];
    case 'full_mouth':
      return [...UPPER_TEETH, ...LOWER_TEETH];
    default:
      return [];
  }
}

/** true si el tipo se registra sobre piezas dentales — espejo de typeImpliesTeeth en el backend. */
export function applicationTypeImpliesTeeth(
  applicationType: TreatmentApplicationType,
): boolean {
  return (
    applicationType === 'single_tooth' ||
    applicationType === 'multiple_teeth' ||
    applicationType === 'upper_arch' ||
    applicationType === 'lower_arch' ||
    applicationType === 'full_mouth'
  );
}

/** true si el tratamiento admite cantidad mayor a 1 (elásticos por unidad, cera por caja, consultas repetidas) — espejo de typeAllowsQuantity en el backend. */
export function applicationTypeAllowsQuantity(
  applicationType: TreatmentApplicationType,
): boolean {
  return !applicationTypeImpliesTeeth(applicationType);
}
