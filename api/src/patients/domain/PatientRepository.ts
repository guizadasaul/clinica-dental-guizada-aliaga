import type { Patient } from './Patient';
import type { MedicalHistory } from './MedicalHistory';
import type { HygieneHabits } from './HygieneHabits';
import type { ClinicalExam } from './ClinicalExam';
import type { PatientWithUser } from './PatientWithUser';
import type { OdontogramEntry } from './OdontogramEntry';
import type { ToothProcedure } from './ToothProcedure';

export interface CreatePatientData {
  firstName: string;
  lastNamePaternal: string;
  lastNameMaternal?: string;
  birthDate: Date;
  birthPlace?: string;
  sex?: string;
  occupation?: string;
  address?: string;
  phone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  consultationReason?: string;
  lastDentistVisit?: Date;
  lastVisitTreatment?: string;
  familyHistory?: string;
  dni?: string;
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
  phone?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  consultationReason?: string;
  lastDentistVisit?: Date;
  lastVisitTreatment?: string;
  familyHistory?: string;
  dni?: string;
}

export interface MedicalHistoryData {
  hasAllergies?: boolean;
  kidneyProblems?: boolean;
  ulcers?: boolean;
  rheumatism?: boolean;
  heartProblems?: boolean;
  diabetes?: boolean;
  hypertension?: boolean;
  hemorrhages?: boolean;
  anemia?: boolean;
  sti?: boolean;
  otherDiseases?: string;
  gestationPeriod?: string;
  // Tri-estado (Sí / No / No sabe) — `null` es un valor legítimo, distinto
  // de "no enviado" (`undefined`).
  anesthesiaReactions?: boolean | null;
  currentMedications?: string;
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
  diagnosisType: string;
  toothCondition: string;
  diagnosisDescription: string;
  xrayRequested?: boolean;
  treatmentId?: string;
  customPrice?: number;
  notes?: string;
}

export interface CreateToothProcedureData {
  toothNumber: number | null;
  applicationGroupId?: string | null;
  treatmentId: string;
  priceCharged: number;
  procedureDate?: Date;
  surfaceVestibular?: boolean;
  surfacePalatal?: boolean;
  surfaceMesial?: boolean;
  surfaceDistal?: boolean;
  surfaceOcclusal?: boolean;
  notes?: string;
  performedBy: string;
}

export interface IPatientRepository {
  findAllWithUsers(): Promise<PatientWithUser[]>;
  findPatientById(id: string): Promise<Patient | null>;
  findByUserId(userId: string): Promise<Patient | null>;
  create(userId: string, data: CreatePatientData): Promise<Patient>;
  /** null si el patientId no existe. */
  updatePatient(id: string, data: UpdatePatientData): Promise<Patient | null>;
  upsertMedicalHistory(
    patientId: string,
    data: MedicalHistoryData,
  ): Promise<MedicalHistory>;
  upsertHygieneHabits(
    patientId: string,
    data: HygieneHabitsData,
  ): Promise<HygieneHabits>;
  createClinicalExam(
    patientId: string,
    data: ClinicalExamData,
  ): Promise<ClinicalExam>;
  createOdontogramEntries(
    patientId: string,
    entries: OdontogramEntryData[],
  ): Promise<OdontogramEntry[]>;
  findOdontogramEntries(patientId: string): Promise<OdontogramEntry[]>;
  createToothProcedures(
    patientId: string,
    data: CreateToothProcedureData[],
  ): Promise<ToothProcedure[]>;
  findToothProcedures(patientId: string): Promise<ToothProcedure[]>;
  /** Aditivo — a diferencia de createOdontogramEntries, no borra las entries existentes del paciente. */
  appendOdontogramEntries(
    patientId: string,
    entries: OdontogramEntryData[],
  ): Promise<OdontogramEntry[]>;
}

export const PatientRepository = Symbol('IPatientRepository');
