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
  address: string | null;
  phone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  consultationReason: string | null;
  lastDentistVisit: string | null;
  lastVisitTreatment: string | null;
  familyHistory: string | null;
  dni: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PatientProfileStatus {
  exists: boolean;
  patient: Patient | null;
}

export interface MedicalHistory {
  id: string;
  patientId: string;
  hasAllergies: boolean;
  kidneyProblems: boolean;
  ulcers: boolean;
  rheumatism: boolean;
  heartProblems: boolean;
  diabetes: boolean;
  hypertension: boolean;
  hemorrhages: boolean;
  anemia: boolean;
  sti: boolean;
  otherDiseases: string | null;
  gestationPeriod: string | null;
  anesthesiaReactions: boolean | null;
  currentMedications: string | null;
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
  diagnosisType: string;
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
  odontogramEntriesCount: number;
}
