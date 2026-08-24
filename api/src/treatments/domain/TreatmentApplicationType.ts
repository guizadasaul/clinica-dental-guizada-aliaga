/**
 * A qué se aplica un tratamiento del catálogo (CLI-41). Reemplaza al
 * `TreatmentScope` de 6 valores, que metía en una sola bolsa (`none`) siete
 * cosas distintas — consulta, tejidos blandos, frenillo, prótesis, ortodoncia,
 * unidades y cajas — y por eso el sistema no podía saber qué pedirle al doctor
 * al elegir un tratamiento.
 *
 * Los valores que implican piezas (`single_tooth`, `multiple_teeth`,
 * `upper_arch`, `lower_arch`, `full_mouth`) son los únicos que muestran
 * selección en el odontograma; el resto se registra sin ningún diente
 * (`tooth_procedures.tooth_number` es nullable justamente para eso).
 */
export const TREATMENT_APPLICATION_TYPES = [
  'general',
  'single_tooth',
  'multiple_teeth',
  'upper_arch',
  'lower_arch',
  'full_mouth',
  'soft_tissue',
  'frenulum',
  'prosthesis',
  'orthodontic',
  'unit',
  'box',
] as const;

export type TreatmentApplicationType =
  (typeof TREATMENT_APPLICATION_TYPES)[number];

export const TREATMENT_CURRENCIES = ['BOB', 'USD'] as const;

export type TreatmentCurrency = (typeof TREATMENT_CURRENCIES)[number];

/** Numeración FDI, arcada superior completa (permanente). */
export const UPPER_ARCH_FDI = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
] as const;

/** Numeración FDI, arcada inferior completa (permanente). */
export const LOWER_ARCH_FDI = [
  48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
] as const;

export const FULL_MOUTH_FDI = [...UPPER_ARCH_FDI, ...LOWER_ARCH_FDI] as const;

export class InvalidApplicationTypeError extends Error {}

/** true si el tipo se registra sobre piezas dentales — sea eligiéndolas el doctor o derivándolas del tipo. */
export function typeImpliesTeeth(type: TreatmentApplicationType): boolean {
  return (
    type === 'single_tooth' ||
    type === 'multiple_teeth' ||
    type === 'upper_arch' ||
    type === 'lower_arch' ||
    type === 'full_mouth'
  );
}

/**
 * true si el tratamiento admite cantidad mayor a 1 — elásticos por unidad,
 * cera por caja, consultas repetidas. Los que se aplican sobre piezas no:
 * ahí la "cantidad" son los dientes marcados.
 */
export function typeAllowsQuantity(type: TreatmentApplicationType): boolean {
  return !typeImpliesTeeth(type);
}

/** Dientes que el tipo implica por sí mismo — [] para los que dependen de lo que marque el doctor o no llevan ninguno. */
export function teethForApplicationType(
  type: TreatmentApplicationType,
): readonly number[] {
  switch (type) {
    case 'upper_arch':
      return UPPER_ARCH_FDI;
    case 'lower_arch':
      return LOWER_ARCH_FDI;
    case 'full_mouth':
      return FULL_MOUTH_FDI;
    default:
      return [];
  }
}

/** true si aplicar este tipo debe generar entradas de odontograma automáticas (arcada/boca completa). */
export function typeGeneratesOdontogramEntries(
  type: TreatmentApplicationType,
): boolean {
  return (
    type === 'upper_arch' || type === 'lower_arch' || type === 'full_mouth'
  );
}

/**
 * Valida que los dientes recibidos correspondan al tipo de aplicación del
 * tratamiento. Lanza InvalidApplicationTypeError (no HttpException — el
 * dominio no conoce Nest) si no corresponden; el caller la traduce a
 * BadRequestException.
 */
export function assertTeethMatchApplicationType(
  type: TreatmentApplicationType,
  toothNumbers: number[],
): void {
  if (new Set(toothNumbers).size !== toothNumbers.length) {
    throw new InvalidApplicationTypeError(
      'No se puede repetir el mismo diente en una misma aplicación.',
    );
  }

  switch (type) {
    case 'single_tooth':
      if (toothNumbers.length !== 1) {
        throw new InvalidApplicationTypeError(
          'Un tratamiento de aplicación "single_tooth" requiere exactamente un diente.',
        );
      }
      return;
    // "1 o varios dientes" — Curetaje periodontal y Gingivoplastia se aplican
    // sobre una sola pieza tanto como sobre un sector, así que el mínimo es 1.
    // Mismo criterio que `multiple_teeth` en el diagnóstico (CLI-40).
    case 'multiple_teeth':
      if (toothNumbers.length < 1) {
        throw new InvalidApplicationTypeError(
          'Un tratamiento de aplicación "multiple_teeth" requiere al menos un diente.',
        );
      }
      return;
    default:
      if (toothNumbers.length !== 0) {
        throw new InvalidApplicationTypeError(
          `Un tratamiento de aplicación "${type}" no debe especificar ningún diente.`,
        );
      }
      return;
  }
}
