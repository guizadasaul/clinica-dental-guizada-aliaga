import type { OdontogramLegendItem } from '../ui/odontogram-chart/odontogram-chart';

/** Lo mínimo de un hallazgo del examen dental que hace falta para pintarlo. */
export interface PaintableFinding {
  readonly toothNumber: number | null;
  readonly diagnosisColor: string;
  readonly categoryName: string;
}

/**
 * Color por diente a partir de los hallazgos de un examen dental: cada
 * diente toma el color de su primer hallazgo; los hallazgos generales (sin
 * diente) no pintan. Mismo criterio en el registro de tratamientos y en la
 * historia clínica (CLI-108).
 */
export function examToothColorMap(findings: readonly PaintableFinding[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const f of findings) {
    if (f.toothNumber !== null && !map.has(f.toothNumber)) {
      map.set(f.toothNumber, f.diagnosisColor);
    }
  }
  return map;
}

/** Leyenda con solo las categorías que aparecen en los hallazgos, sin repetir. */
export function examLegendItems(findings: readonly PaintableFinding[]): OdontogramLegendItem[] {
  const byCategory = new Map<string, OdontogramLegendItem>();
  for (const f of findings) {
    if (!byCategory.has(f.categoryName)) {
      byCategory.set(f.categoryName, { name: f.categoryName, color: f.diagnosisColor });
    }
  }
  return [...byCategory.values()];
}
