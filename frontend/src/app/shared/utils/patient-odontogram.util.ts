import type { OdontogramLegendItem } from '../ui/odontogram-chart/odontogram-chart';
import { examToothColorMap, examToothNames, type PaintableFinding } from './odontogram-paint.util';

/** Lo mínimo de una categoría del catálogo de diagnósticos para la leyenda. */
export interface LegendCategory {
  readonly name: string;
  readonly diagnoses: readonly { readonly color: string }[];
}

/** Lo mínimo de un tratamiento realizado para pintar su diente. */
export interface PaintableProcedure {
  readonly toothNumber: number | null;
  readonly procedureDate: string;
  readonly createdAt: string;
  readonly categoryCode: string;
  readonly categoryName: string;
  readonly categoryColor: string;
}

/** Lo que necesita `<app-odontogram-chart>` para mostrar a un paciente. */
export interface PatientOdontogram {
  readonly toothColor: Map<number, string>;
  readonly toothNames: Map<number, string[]>;
  readonly treatedTeeth: number[];
  readonly legendItems: OdontogramLegendItem[];
}

export const EMPTY_PATIENT_ODONTOGRAM: PatientOdontogram = {
  toothColor: new Map(),
  toothNames: new Map(),
  treatedTeeth: [],
  legendItems: [],
};

/**
 * Dientes que pinta un tratamiento ya realizado (CLI-179): solo los de un
 * diente o de varios dientes concretos (una fila por diente). Los de arcada y
 * boca completa (y los de tejido blando, prótesis, etc.) no pintan: se ven en
 * el historial.
 */
function procedureTeeth(procedure: PaintableProcedure): number[] {
  return procedure.toothNumber === null ? [] : [procedure.toothNumber];
}

/**
 * El odontograma de un paciente tal como se ve al registrar tratamientos
 * (CLI-41) y al armar su presupuesto (CLI-256): el diagnóstico vigente, y
 * encima el color de la categoría del último tratamiento realizado en cada
 * diente (CLI-107). Leyenda: una entrada por categoría del catálogo con al
 * menos un diagnóstico, más las categorías de tratamientos que pintan algo.
 */
export function patientOdontogram(
  catalog: readonly LegendCategory[],
  findings: readonly PaintableFinding[],
  procedures: readonly PaintableProcedure[],
): PatientOdontogram {
  const painting = procedures
    .filter((p) => procedureTeeth(p).length > 0)
    .sort((a, b) =>
      a.procedureDate === b.procedureDate
        ? a.createdAt.localeCompare(b.createdAt)
        : a.procedureDate.localeCompare(b.procedureDate),
    );

  // Del más viejo al más nuevo: el último tratamiento de cada diente pisa.
  const treatmentColors = new Map<number, string>();
  for (const p of painting) {
    for (const n of procedureTeeth(p)) {
      treatmentColors.set(n, p.categoryColor);
    }
  }

  const toothColor = examToothColorMap(findings);
  for (const [n, color] of treatmentColors) {
    toothColor.set(n, color);
  }

  const diagnosisLegend = catalog
    .filter((c) => c.diagnoses.length > 0)
    .map((c) => ({ name: c.name, color: c.diagnoses[0].color, group: 'Diagnósticos' }));
  const treatmentLegend = new Map<string, OdontogramLegendItem>();
  for (const p of painting) {
    if (!treatmentLegend.has(p.categoryCode)) {
      treatmentLegend.set(p.categoryCode, {
        name: p.categoryName,
        color: p.categoryColor,
        group: 'Tratamientos',
      });
    }
  }

  return {
    toothColor,
    toothNames: examToothNames(findings),
    treatedTeeth: [...treatmentColors.keys()],
    legendItems: [...diagnosisLegend, ...treatmentLegend.values()],
  };
}
