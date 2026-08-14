export const TREATMENT_SCOPES = [
  'tooth',
  'multi_tooth',
  'upper_arch',
  'lower_arch',
  'full_mouth',
  'none',
] as const;

export type TreatmentScope = (typeof TREATMENT_SCOPES)[number];

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

export class InvalidScopeApplicationError extends Error {}

/** Dientes que el scope implica por sí mismo — [] para tooth/multi_tooth/none, que dependen de la selección del doctor. */
export function teethForScope(scope: TreatmentScope): readonly number[] {
  switch (scope) {
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

/** true si aplicar este scope debe generar entradas de odontograma automáticas (arcada/boca completa). */
export function scopeGeneratesOdontogramEntries(
  scope: TreatmentScope,
): boolean {
  return (
    scope === 'upper_arch' || scope === 'lower_arch' || scope === 'full_mouth'
  );
}

/**
 * Valida que los dientes recibidos correspondan al scope del tratamiento.
 * Lanza InvalidScopeApplicationError (no HttpException — el dominio no
 * conoce Nest) si no corresponden; el caller la traduce a BadRequestException.
 */
export function assertTeethMatchScope(
  scope: TreatmentScope,
  toothNumbers: number[],
): void {
  if (new Set(toothNumbers).size !== toothNumbers.length) {
    throw new InvalidScopeApplicationError(
      'No se puede repetir el mismo diente en una misma aplicación.',
    );
  }

  switch (scope) {
    case 'tooth':
      if (toothNumbers.length !== 1) {
        throw new InvalidScopeApplicationError(
          'Un tratamiento de alcance "tooth" requiere exactamente un diente.',
        );
      }
      return;
    case 'multi_tooth':
      if (toothNumbers.length < 2) {
        throw new InvalidScopeApplicationError(
          'Un tratamiento de alcance "multi_tooth" requiere al menos 2 dientes.',
        );
      }
      return;
    case 'upper_arch':
    case 'lower_arch':
    case 'full_mouth':
    case 'none':
      if (toothNumbers.length !== 0) {
        throw new InvalidScopeApplicationError(
          `Un tratamiento de alcance "${scope}" no debe especificar ningún diente.`,
        );
      }
      return;
  }
}
