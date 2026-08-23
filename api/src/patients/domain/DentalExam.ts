import type { DentalExamFinding } from './DentalExamFinding';

/** Versión inmutable del examen dental de un paciente — nunca se actualiza ni se borra. */
export interface DentalExam {
  id: string;
  patientId: string;
  version: number;
  recordedBy: string;
  recordedByName: string | null;
  recordedAt: Date;
  changeReason: string | null;
  notes: string | null;
  findings: DentalExamFinding[];
}

/** Metadata de una versión sin sus findings — para listar el historial sin traer todo. */
export interface DentalExamVersionSummary {
  id: string;
  version: number;
  recordedBy: string;
  recordedByName: string | null;
  recordedAt: Date;
  changeReason: string | null;
  findingsCount: number;
}
