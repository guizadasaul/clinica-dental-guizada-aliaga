import type { DentalExam } from './dental-exam.model';
import type { ClinicalExam, HygieneHabits, MedicalHistory, Patient } from './patient.model';

/** GET /patients/me/clinical-record (CLI-213): la historia clínica inicial del propio paciente. */
export interface PatientClinicalRecord {
  patient: Patient;
  medicalHistory: MedicalHistory | null;
  hygieneHabits: HygieneHabits | null;
  /** El examen clínico más antiguo (el de la primera visita). */
  clinicalExam: ClinicalExam | null;
  /** El primer diagnóstico desde cero, con sus hallazgos. */
  initialDiagnosis: DentalExam | null;
}
