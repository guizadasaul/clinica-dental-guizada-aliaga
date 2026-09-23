import type { Patient } from './Patient';
import type { MedicalHistory } from './MedicalHistory';
import type { HygieneHabits } from './HygieneHabits';
import type { ClinicalExam } from './ClinicalExam';
import type { PatientWithUser } from './PatientWithUser';
import type { OdontogramEntry } from './OdontogramEntry';
import type { ToothProcedure } from './ToothProcedure';
import type {
  DentalExam,
  DentalExamKind,
  DentalExamVersionSummary,
} from './DentalExam';

export interface CreatePatientData {
  firstName: string;
  lastNamePaternal: string;
  lastNameMaternal?: string;
  birthDate: Date;
  birthPlace?: string;
  sex?: string;
  occupation?: string;
  address?: string;
  zona?: string;
  ciudad?: string;
  phone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  consultationReason?: string;
  lastDentistVisit?: Date;
  lastVisitTreatment?: string;
  familyHistory?: string;
  documentType?: string;
  dni?: string;
  /** CLI-58: el doctor que hace el alta manual, si quien crea la ficha es odontólogo. */
  assignedDoctorId?: string;
}

export interface UpdatePatientData {
  firstName?: string;
  lastNamePaternal?: string;
  lastNameMaternal?: string;
  birthDate?: Date;
  birthPlace?: string;
  sex?: string;
  occupation?: string;
  address?: string;
  zona?: string;
  ciudad?: string;
  phone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  consultationReason?: string;
  lastDentistVisit?: Date;
  lastVisitTreatment?: string;
  familyHistory?: string;
  documentType?: string;
  dni?: string;
}

/** Ya resuelta contra el catálogo (medicalConditionId, no el code) — el service hace esa resolución. */
export interface MedicalConditionEntryData {
  medicalConditionId: string;
  diagnosedAt?: Date;
  notes?: string;
}

export interface PatientMedicationData {
  drugName: string;
  dose?: string;
  frequency?: string;
  startedAt?: Date;
}

export interface MedicalHistoryData {
  /** Reemplaza el conjunto completo — igual semántica que los booleanos de antes (CLI-50). */
  conditions?: MedicalConditionEntryData[];
  otherDiseases?: string;
  gestationLmpDate?: Date;
  // Tri-estado (Sí / No / No sabe) — `null` es un valor legítimo, distinto
  // de "no enviado" (`undefined`).
  anesthesiaReactions?: boolean | null;
  medications?: PatientMedicationData[];
}

export interface HygieneHabitsData {
  usesToothbrush?: boolean;
  brushingFrequency?: string;
  usesDentalFloss?: boolean;
  usesToothpick?: boolean;
  brushesTongue?: boolean;
  usesMouthwash?: boolean;
}

export interface ClinicalExamData {
  tartar?: boolean;
  saburra?: boolean;
  bacterialPlaque?: boolean;
  halitosis?: boolean;
  occlusion?: string;
}

export interface OdontogramEntryData {
  toothNumber: number;
  toothType?: string;
  toothCondition: string;
  /** Opcional (CLI-52) — solo lo llena el endpoint manual viejo, createToothProcedure ya no necesita rellenarlo. */
  diagnosisDescription?: string;
  treatmentId?: string;
  customPrice?: number;
  notes?: string;
}

export interface DentalExamFindingData {
  diagnosisId: string;
  toothNumber?: number;
  toothType?: string;
  applicationGroupId?: string;
  modifierValue?: string;
  description?: string;
  xrayRequested?: boolean;
  notes?: string;
}

export interface CreateDentalExamData {
  findings: DentalExamFindingData[];
  /** Sin valor: `diagnosis` si es la primera versión del paciente, `correction` si no (CLI-109). */
  kind?: DentalExamKind;
  changeReason?: string;
  notes?: string;
}

export interface CreateToothProcedureData {
  toothNumber: number | null;
  treatmentId: string;
  priceCharged: number;
  /** Para aplicaciones por unidad/caja (CLI-41) — price_charged = quantity × base_price. 1 para el resto. */
  quantity?: number;
  procedureDate?: Date;
  /** Códigos de tooth_surfaces (CLI-49) — [] o undefined si ninguna. */
  surfaceCodes?: string[];
  notes?: string;
  performedBy: string;
}

export interface ToothProcedureGroupMember {
  toothNumber: number;
  /** Códigos de tooth_surfaces (CLI-49) — [] o undefined si ninguna. */
  surfaceCodes?: string[];
}

/**
 * Una aplicación multiple_teeth: un precio (a nivel de grupo, CLI-53) y una
 * fila de tooth_procedures por diente colgando de él, cada una con SUS
 * PROPIAS superficies (CLI-41) pero sin precio propio.
 */
export interface CreateToothProcedureGroupData {
  treatmentId: string;
  teeth: ToothProcedureGroupMember[];
  priceCharged: number;
  procedureDate?: Date;
  notes?: string;
  performedBy: string;
}

export interface IPatientRepository {
  /** CLI-58: doctorId es un filtro de conveniencia, no de seguridad — sin él devuelve todos los pacientes, igual que siempre (visibilidad compartida). */
  findAllWithUsers(doctorId?: string): Promise<PatientWithUser[]>;
  findPatientById(id: string): Promise<Patient | null>;
  findByUserId(userId: string): Promise<Patient | null>;
  create(userId: string, data: CreatePatientData): Promise<Patient>;
  /** null si el patientId no existe. */
  updatePatient(id: string, data: UpdatePatientData): Promise<Patient | null>;
  upsertMedicalHistory(
    patientId: string,
    data: MedicalHistoryData,
  ): Promise<MedicalHistory>;
  findMedicalHistory(patientId: string): Promise<MedicalHistory | null>;
  upsertHygieneHabits(
    patientId: string,
    data: HygieneHabitsData,
  ): Promise<HygieneHabits>;
  findHygieneHabits(patientId: string): Promise<HygieneHabits | null>;
  createClinicalExam(
    patientId: string,
    data: ClinicalExamData,
  ): Promise<ClinicalExam>;
  /** El examen clínico más reciente (upsert por día — puede haber uno distinto por fecha). */
  findLatestClinicalExam(patientId: string): Promise<ClinicalExam | null>;
  createOdontogramEntries(
    patientId: string,
    entries: OdontogramEntryData[],
  ): Promise<OdontogramEntry[]>;
  findOdontogramEntries(patientId: string): Promise<OdontogramEntry[]>;
  /** Filas sueltas (single_tooth/general/arcadas), cada una con su propio precio. */
  createToothProcedures(
    patientId: string,
    data: CreateToothProcedureData[],
  ): Promise<ToothProcedure[]>;
  /** Crea el application_groups (precio del grupo) + una fila de tooth_procedures por diente, sin precio propio. */
  createToothProcedureGroup(
    patientId: string,
    data: CreateToothProcedureGroupData,
  ): Promise<ToothProcedure[]>;
  findToothProcedures(patientId: string): Promise<ToothProcedure[]>;
  /** Aditivo — a diferencia de createOdontogramEntries, no borra las entries existentes del paciente. */
  appendOdontogramEntries(
    patientId: string,
    entries: OdontogramEntryData[],
  ): Promise<OdontogramEntry[]>;
  /** Append-only: siempre crea la versión max(version)+1, nunca actualiza una existente. */
  createDentalExam(
    patientId: string,
    recordedBy: string,
    data: CreateDentalExamData,
  ): Promise<DentalExam>;
  findDentalExamVersions(
    patientId: string,
  ): Promise<DentalExamVersionSummary[]>;
  findCurrentDentalExam(patientId: string): Promise<DentalExam | null>;
  /** null si el examId no existe o no pertenece al paciente. */
  findDentalExam(patientId: string, examId: string): Promise<DentalExam | null>;
}

export const PatientRepository = Symbol('IPatientRepository');
