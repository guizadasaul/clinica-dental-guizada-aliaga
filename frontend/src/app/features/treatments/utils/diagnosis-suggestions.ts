import { clinicToday } from '../../../shared/utils/clinic-date.util';

/** Lo mínimo de un hallazgo del examen vigente. */
export interface SuggestionFinding {
  readonly diagnosisCode: string;
  readonly diagnosisName: string;
  readonly toothNumber: number | null;
}

/** Lo mínimo de un tratamiento ya realizado. */
export interface SuggestionProcedure {
  readonly treatmentId: string;
  readonly toothNumber: number | null;
  readonly procedureDate: string;
}

/** Lo mínimo de un pendiente del presupuesto. */
export interface SuggestionPlanLine {
  readonly treatmentId: string;
  readonly toothNumbers: readonly number[];
}

/** Un tratamiento que sugiere el diagnóstico, con las piezas que lo piden. */
export interface DiagnosisSuggestion {
  readonly key: string;
  readonly treatmentId: string;
  /** [] para un diagnóstico general (sin pieza). */
  readonly toothNumbers: number[];
  readonly diagnosisNames: string[];
}

interface Group {
  treatmentId: string;
  general: boolean;
  teeth: Set<number>;
  names: string[];
  /** Mejor posición del tratamiento entre las sugerencias (0 = el más habitual). */
  rank: number;
  order: number;
}

/**
 * Lo que el diagnóstico vigente sugiere hacerle al paciente (CLI-266), para
 * agendar: un ítem por tratamiento sugerido (CLI-119), con las piezas que lo
 * piden. Deja afuera:
 * - las piezas que ya se trataron desde el día del examen;
 * - lo que ya está como pendiente en su presupuesto (se ofrece aparte);
 * - en un diagnóstico general, el tratamiento ya hecho desde el examen.
 * Orden: el tratamiento más habitual para su diagnóstico primero.
 */
export function diagnosisSuggestions(
  exam: { readonly recordedAt: string; readonly findings: readonly SuggestionFinding[] } | null,
  suggestedByCode: ReadonlyMap<string, readonly string[]>,
  procedures: readonly SuggestionProcedure[],
  planLines: readonly SuggestionPlanLine[],
): DiagnosisSuggestion[] {
  if (!exam || exam.findings.length === 0) {
    return [];
  }
  const examDay = clinicToday(new Date(exam.recordedAt));
  const sinceExam = procedures.filter((p) => p.procedureDate.slice(0, 10) >= examDay);
  const treatedTeeth = new Set(sinceExam.flatMap((p) => (p.toothNumber === null ? [] : [p.toothNumber])));
  const doneGeneral = new Set(sinceExam.filter((p) => p.toothNumber === null).map((p) => p.treatmentId));

  const groups = new Map<string, Group>();
  for (const finding of exam.findings) {
    const tooth = finding.toothNumber;
    if (tooth !== null && treatedTeeth.has(tooth)) {
      continue;
    }
    (suggestedByCode.get(finding.diagnosisCode) ?? []).forEach((treatmentId, rank) => {
      const general = tooth === null;
      if (general && doneGeneral.has(treatmentId)) {
        return;
      }
      const key = `${treatmentId}:${general ? 'general' : 'teeth'}`;
      const group = groups.get(key) ?? {
        treatmentId,
        general,
        teeth: new Set<number>(),
        names: [],
        rank,
        order: groups.size,
      };
      if (tooth !== null) {
        group.teeth.add(tooth);
      }
      if (!group.names.includes(finding.diagnosisName)) {
        group.names.push(finding.diagnosisName);
      }
      group.rank = Math.min(group.rank, rank);
      groups.set(key, group);
    });
  }

  const planned = (treatmentId: string) => planLines.filter((l) => l.treatmentId === treatmentId);
  return [...groups.values()]
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .flatMap((g) => {
      const lines = planned(g.treatmentId);
      if (g.general) {
        return lines.some((l) => l.toothNumbers.length === 0) ? [] : [toSuggestion(g, [])];
      }
      const inPlan = new Set(lines.flatMap((l) => l.toothNumbers));
      const teeth = [...g.teeth].filter((n) => !inPlan.has(n)).sort((a, b) => a - b);
      return teeth.length > 0 ? [toSuggestion(g, teeth)] : [];
    });
}

function toSuggestion(group: Group, toothNumbers: number[]): DiagnosisSuggestion {
  return {
    key: `${group.treatmentId}:${toothNumbers.join('-') || 'general'}`,
    treatmentId: group.treatmentId,
    toothNumbers,
    diagnosisNames: group.names,
  };
}
