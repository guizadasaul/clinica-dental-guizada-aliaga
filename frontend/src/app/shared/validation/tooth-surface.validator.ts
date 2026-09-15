// Espejo de api/src/shared/validators/tooth-surface.validator.ts — cambiar
// los dos juntos. Función pura, sin Angular.
import type { ToothSurfaceCode } from '../../features/treatments/models/treatment.model';

export const TOOTH_SURFACE_CODES: readonly ToothSurfaceCode[] = [
  'vestibular',
  'palatal',
  'lingual',
  'mesial',
  'distal',
  'occlusal',
  'incisal',
];

function positionOf(toothNumber: number): number {
  return toothNumber % 10;
}

function quadrantOf(toothNumber: number): number {
  return Math.floor(toothNumber / 10);
}

/** Incisivos y caninos (posición 1-3) tienen borde incisal, no cara oclusal. */
function isAnteriorTooth(toothNumber: number): boolean {
  return positionOf(toothNumber) <= 3;
}

/** Cuadrantes 1,2 (permanente) y 5,6 (decidua) son la arcada superior. */
function isUpperArch(toothNumber: number): boolean {
  const quadrant = quadrantOf(toothNumber);
  return quadrant === 1 || quadrant === 2 || quadrant === 5 || quadrant === 6;
}

/**
 * Superficies anatómicamente válidas para un diente puntual: palatal
 * (arcada superior) o lingual (inferior), nunca las dos; incisal
 * (incisivo/canino) u oclusal (premolar/molar), nunca las dos.
 * Vestibular/mesial/distal aplican siempre.
 */
export function allowedSurfacesForTooth(
  toothNumber: number,
): Set<ToothSurfaceCode> {
  return new Set<ToothSurfaceCode>([
    'vestibular',
    'mesial',
    'distal',
    isUpperArch(toothNumber) ? 'palatal' : 'lingual',
    isAnteriorTooth(toothNumber) ? 'incisal' : 'occlusal',
  ]);
}
