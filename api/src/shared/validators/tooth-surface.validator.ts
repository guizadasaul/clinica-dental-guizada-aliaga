// CLI-49: catálogo fijo de superficies dentales — igual que
// clinical-options.ts (BLACK_CLASSES/MOBILITY_GRADES), es una escala
// anatómica universal, no algo que edite la clínica, así que vive como
// constante en código en vez de resolverse contra tooth_surfaces en cada
// request. tooth_surfaces existe para la integridad referencial de
// tooth_procedure_surfaces, no como fuente de verdad de este set.
export const TOOTH_SURFACE_CODES = [
  'vestibular',
  'palatal',
  'lingual',
  'mesial',
  'distal',
  'occlusal',
  'incisal',
] as const;

export type ToothSurfaceCode = (typeof TOOTH_SURFACE_CODES)[number];

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

export class InvalidToothSurfaceError extends Error {}

/**
 * Lanza InvalidToothSurfaceError (no HttpException — el dominio no conoce
 * Nest) si algún código es desconocido o anatómicamente imposible para el
 * diente; el caller la traduce a BadRequestException.
 */
export function assertValidSurfacesForTooth(
  toothNumber: number,
  codes: string[],
): void {
  const allowed = allowedSurfacesForTooth(toothNumber);
  for (const code of codes) {
    if (!TOOTH_SURFACE_CODES.includes(code as ToothSurfaceCode)) {
      throw new InvalidToothSurfaceError(`Superficie desconocida: ${code}`);
    }
    if (!allowed.has(code as ToothSurfaceCode)) {
      throw new InvalidToothSurfaceError(
        `La superficie "${code}" no es válida para el diente ${toothNumber}.`,
      );
    }
  }
}
