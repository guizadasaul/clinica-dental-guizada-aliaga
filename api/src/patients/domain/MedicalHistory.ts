import type { MedicalConditionEntry } from './MedicalConditionEntry';
import type { PatientMedication } from './PatientMedication';
import type { GestationTrimester } from './gestation.util';

/**
 * Historia médica del paciente (CLI-50) — dejó de ser un objeto plano de
 * booleanos/texto libre para agregar condiciones y medicación como listas
 * propias (conditions/medications), cada una resuelta contra su catálogo.
 * No es un snapshot histórico como DentalExam: upsertMedicalHistory
 * reemplaza el conjunto completo en cada guardado, así que esto siempre
 * refleja el estado vigente, no una versión.
 */
export interface MedicalHistory {
  id: string;
  patientId: string;
  conditions: MedicalConditionEntry[];
  otherDiseases: string | null;
  gestationLmpDate: Date | null;
  /** Derivado de gestationLmpDate al momento de leer — null si no hay fecha o quedó fuera de rango (ver gestationTrimesterFor). */
  gestationTrimester: GestationTrimester | null;
  // Tri-estado (Sí / No / No sabe) — `null` es un valor legítimo, distinto de "no registrado".
  anesthesiaReactions: boolean | null;
  medications: PatientMedication[];
  updatedAt: Date;
}
