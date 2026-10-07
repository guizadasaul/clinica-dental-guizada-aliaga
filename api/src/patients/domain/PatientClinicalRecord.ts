import type { ClinicalExam } from './ClinicalExam';
import type { DentalExam } from './DentalExam';
import type { HygieneHabits } from './HygieneHabits';
import type { MedicalHistory } from './MedicalHistory';
import type { Patient } from './Patient';

/**
 * Historia clínica inicial que ve el propio paciente en "Mi perfil" (CLI-213):
 * lo que el doctor registró en su primera visita. Solo lectura. Antecedentes e
 * higiene se guardan como estado vigente (no por versión), así que son los
 * actuales; el examen clínico y el diagnóstico son los primeros registrados.
 */
export interface PatientClinicalRecord {
  patient: Patient;
  medicalHistory: MedicalHistory | null;
  hygieneHabits: HygieneHabits | null;
  /** El examen clínico más antiguo (por fecha de examen). */
  clinicalExam: ClinicalExam | null;
  /** El primer diagnóstico desde cero (kind `diagnosis`, versión más baja), con sus hallazgos. */
  initialDiagnosis: DentalExam | null;
}
