import type { DentalExamFinding } from './DentalExamFinding';

/**
 * `diagnosis` = diagnóstico desde cero (el primero, o uno nuevo cuando el
 * paciente vuelve tras un tiempo); `correction` = corrección del vigente (CLI-109).
 */
export const DENTAL_EXAM_KINDS = ['diagnosis', 'correction'] as const;
export type DentalExamKind = (typeof DENTAL_EXAM_KINDS)[number];

/** Versión inmutable del examen dental de un paciente — nunca se actualiza ni se borra. */
export interface DentalExam {
  id: string;
  patientId: string;
  version: number;
  kind: DentalExamKind;
  recordedBy: string;
  recordedByName: string | null;
  recordedAt: Date;
  changeReason: string | null;
  notes: string | null;
  findings: DentalExamFinding[];
}

/** Metadata de una versión sin sus findings — para listar el historial sin traer el detalle completo. */
export interface DentalExamVersionSummary {
  id: string;
  version: number;
  kind: DentalExamKind;
  recordedBy: string;
  recordedByName: string | null;
  recordedAt: Date;
  changeReason: string | null;
  findingsCount: number;
}
