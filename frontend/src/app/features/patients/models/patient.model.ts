export interface Patient {
  id: string;
  userId: string;
  firstName: string;
  lastNamePaternal: string;
  lastNameMaternal: string | null;
  birthDate: string;
  birthPlace: string | null;
  sex: string | null;
  occupation: string | null;
  /** Resto de la dirección (calle, número, referencias) — zona/ciudad son campos propios (CLI-54). */
  address: string | null;
  zona: string | null;
  ciudad: string | null;
  phone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  consultationReason: string | null;
  lastDentistVisit: string | null;
  lastVisitTreatment: string | null;
  familyHistory: string | null;
  /** ci | pasaporte | nit (CLI-54) — junto con dni forman la clave única real. */
  documentType: string | null;
  dni: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PatientProfileStatus {
  exists: boolean;
  patient: Patient | null;
}

export interface MedicalConditionEntry {
  code: string;
  name: string;
  diagnosedAt: string | null;
  notes: string | null;
}

export interface PatientMedication {
  id: string;
  drugName: string;
  dose: string | null;
  frequency: string | null;
  startedAt: string | null;
}

export interface MedicalHistory {
  id: string;
  patientId: string;
  conditions: MedicalConditionEntry[];
  otherDiseases: string | null;
  gestationLmpDate: string | null;
  /** Derivado por el backend a partir de gestationLmpDate — null si no hay fecha o quedó fuera de rango. */
  gestationTrimester: 1 | 2 | 3 | null;
  anesthesiaReactions: boolean | null;
  medications: PatientMedication[];
  updatedAt: string;
}

export interface HygieneHabits {
  id: string;
  patientId: string;
  usesToothbrush: boolean;
  brushingFrequency: string | null;
  usesDentalFloss: boolean;
  usesToothpick: boolean;
  brushesTongue: boolean;
  usesMouthwash: boolean;
  updatedAt: string;
}

export interface ClinicalExam {
  id: string;
  patientId: string;
  tartar: boolean;
  saburra: boolean;
  bacterialPlaque: boolean;
  halitosis: boolean;
  occlusion: string | null;
  examDate: string;
  createdAt: string;
}

export interface OdontogramEntry {
  id: string;
  patientId: string;
  toothNumber: number;
  toothType: string;
  toothCondition: string;
  diagnosisDescription: string;
  xrayRequested: boolean;
  treatmentId: string | null;
  customPrice: number | null;
  entryDate: string;
  notes: string | null;
  createdAt: string;
}

export interface PatientWithUser {
  userId: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  patient: Patient | null;
  dentalExamsCount: number;
  hasAccount: boolean;
}

export interface PatientInviteContact {
  patientId: string;
  firstName: string;
  lastNamePaternal: string;
  phone: string | null;
  email: string | null;
}
