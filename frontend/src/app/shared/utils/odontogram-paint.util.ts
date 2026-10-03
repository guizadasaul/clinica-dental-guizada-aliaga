import type { OdontogramLegendItem } from '../ui/odontogram-chart/odontogram-chart';

/** Lo mínimo de un hallazgo del examen dental que hace falta para pintarlo. */
export interface PaintableFinding {
  readonly toothNumber: number | null;
  readonly diagnosisColor: string;
  readonly categoryName: string;
  /** Nombre del diagnóstico — se lista cuando un diente tiene más de uno (CLI-179). */
  readonly diagnosisName?: string;
  /** No nulo si el hallazgo es de varios dientes (una fila por diente). */
  readonly applicationGroupId?: string | null;
}

/** Un diagnóstico sobre un diente, venga del examen guardado o de un borrador en edición. */
export interface ToothMark {
  readonly toothNumber: number;
  readonly color: string;
  readonly name: string;
  /** true si el diagnóstico abarca varios dientes. */
  readonly grouped: boolean;
}

export interface ToothPaint {
  /** Color de cada diente con al menos un diagnóstico. */
  readonly colors: Map<number, string>;
  /** Nombres de los diagnósticos de cada diente, sin repetir, en el mismo orden que decide el color. */
  readonly names: Map<number, string[]>;
}

/**
 * Regla única de pintado (CLI-179), la misma en el diagnóstico, en el registro
 * de tratamientos y en la historia: cada diente toma el color de su primer
 * diagnóstico, contando primero los de un solo diente y después los de varios
 * (en el orden en que llegan, que la API ya devuelve fijo). Así dos
 * diagnósticos en un diente se ven igual en todas las pantallas.
 */
export function toothPaint(marks: readonly ToothMark[]): ToothPaint {
  const ordered = [...marks.filter((m) => !m.grouped), ...marks.filter((m) => m.grouped)];
  const colors = new Map<number, string>();
  const names = new Map<number, string[]>();
  for (const m of ordered) {
    if (!colors.has(m.toothNumber)) { colors.set(m.toothNumber, m.color); }
    const list = names.get(m.toothNumber) ?? [];
    if (!list.includes(m.name)) { list.push(m.name); }
    names.set(m.toothNumber, list);
  }
  return { colors, names };
}

/** Hallazgos del examen guardado → marcas por diente. Los generales (sin diente) no pintan. */
export function examToothMarks(findings: readonly PaintableFinding[]): ToothMark[] {
  return findings
    .filter((f): f is PaintableFinding & { toothNumber: number } => f.toothNumber !== null)
    .map((f) => ({
      toothNumber: f.toothNumber,
      color: f.diagnosisColor,
      name: f.diagnosisName ?? f.categoryName,
      grouped: !!f.applicationGroupId,
    }));
}

/** Color por diente a partir de los hallazgos de un examen dental (ver `toothPaint`). */
export function examToothColorMap(findings: readonly PaintableFinding[]): Map<number, string> {
  return toothPaint(examToothMarks(findings)).colors;
}

/** Nombres de los diagnósticos por diente, para el indicador "+N" del odontograma (CLI-179). */
export function examToothNames(findings: readonly PaintableFinding[]): Map<number, string[]> {
  return toothPaint(examToothMarks(findings)).names;
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
