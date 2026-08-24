import type { TreatmentApplicationType } from '../../features/treatments/models/treatment.model';

export interface ToothDef {
  readonly number: number;
  readonly type: 'incisor' | 'canine' | 'premolar' | 'molar';
  readonly arch: 'upper' | 'lower';
}

export const UPPER_TEETH: ToothDef[] = [
  { number: 18, type: 'molar', arch: 'upper' },
  { number: 17, type: 'molar', arch: 'upper' },
  { number: 16, type: 'molar', arch: 'upper' },
  { number: 15, type: 'premolar', arch: 'upper' },
  { number: 14, type: 'premolar', arch: 'upper' },
  { number: 13, type: 'canine', arch: 'upper' },
  { number: 12, type: 'incisor', arch: 'upper' },
  { number: 11, type: 'incisor', arch: 'upper' },
  { number: 21, type: 'incisor', arch: 'upper' },
  { number: 22, type: 'incisor', arch: 'upper' },
  { number: 23, type: 'canine', arch: 'upper' },
  { number: 24, type: 'premolar', arch: 'upper' },
  { number: 25, type: 'premolar', arch: 'upper' },
  { number: 26, type: 'molar', arch: 'upper' },
  { number: 27, type: 'molar', arch: 'upper' },
  { number: 28, type: 'molar', arch: 'upper' },
];

export const LOWER_TEETH: ToothDef[] = [
  { number: 48, type: 'molar', arch: 'lower' },
  { number: 47, type: 'molar', arch: 'lower' },
  { number: 46, type: 'molar', arch: 'lower' },
  { number: 45, type: 'premolar', arch: 'lower' },
  { number: 44, type: 'premolar', arch: 'lower' },
  { number: 43, type: 'canine', arch: 'lower' },
  { number: 42, type: 'incisor', arch: 'lower' },
  { number: 41, type: 'incisor', arch: 'lower' },
  { number: 31, type: 'incisor', arch: 'lower' },
  { number: 32, type: 'incisor', arch: 'lower' },
  { number: 33, type: 'canine', arch: 'lower' },
  { number: 34, type: 'premolar', arch: 'lower' },
  { number: 35, type: 'premolar', arch: 'lower' },
  { number: 36, type: 'molar', arch: 'lower' },
  { number: 37, type: 'molar', arch: 'lower' },
  { number: 38, type: 'molar', arch: 'lower' },
];

export const UPPER_DECIDUOUS_TEETH: ToothDef[] = [
  { number: 55, type: 'molar', arch: 'upper' },
  { number: 54, type: 'molar', arch: 'upper' },
  { number: 53, type: 'canine', arch: 'upper' },
  { number: 52, type: 'incisor', arch: 'upper' },
  { number: 51, type: 'incisor', arch: 'upper' },
  { number: 61, type: 'incisor', arch: 'upper' },
  { number: 62, type: 'incisor', arch: 'upper' },
  { number: 63, type: 'canine', arch: 'upper' },
  { number: 64, type: 'molar', arch: 'upper' },
  { number: 65, type: 'molar', arch: 'upper' },
];

export const LOWER_DECIDUOUS_TEETH: ToothDef[] = [
  { number: 85, type: 'molar', arch: 'lower' },
  { number: 84, type: 'molar', arch: 'lower' },
  { number: 83, type: 'canine', arch: 'lower' },
  { number: 82, type: 'incisor', arch: 'lower' },
  { number: 81, type: 'incisor', arch: 'lower' },
  { number: 71, type: 'incisor', arch: 'lower' },
  { number: 72, type: 'incisor', arch: 'lower' },
  { number: 73, type: 'canine', arch: 'lower' },
  { number: 74, type: 'molar', arch: 'lower' },
  { number: 75, type: 'molar', arch: 'lower' },
];

export const FULL_MOUTH_TEETH: ToothDef[] = [...UPPER_TEETH, ...LOWER_TEETH];

/**
 * Espejo frontend de `teethForApplicationType` en
 * api/src/treatments/domain/TreatmentApplicationType.ts — cambiar uno
 * implica revisar el otro. Devuelve [] para todo lo que no sea arcada/boca
 * completa: single_tooth/multiple_teeth dependen de la selección del
 * doctor, y el resto (general, soft_tissue, frenulum, prosthesis,
 * orthodontic, unit, box) no lleva diente.
 */
export function teethForApplicationType(
  applicationType: TreatmentApplicationType,
): number[] {
  switch (applicationType) {
    case 'upper_arch':
      return UPPER_TEETH.map((t) => t.number);
    case 'lower_arch':
      return LOWER_TEETH.map((t) => t.number);
    case 'full_mouth':
      return FULL_MOUTH_TEETH.map((t) => t.number);
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
