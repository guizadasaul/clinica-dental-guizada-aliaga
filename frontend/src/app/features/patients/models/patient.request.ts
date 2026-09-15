export interface CreatePatientRequest {
  userId: string;
  firstName: string;
  lastNamePaternal: string;
  lastNameMaternal?: string;
  birthDate: string;
  birthPlace: string;
  sex: string;
  occupation: string;
  address: string;
  zona: string;
  ciudad: string;
  // El teléfono del PACIENTE sigue opcional — a diferencia del contacto de
  // emergencia, no está en la lista de campos obligatorios.
  phone?: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
  consultationReason?: string;
  lastDentistVisit?: string;
  lastVisitTreatment?: string;
  familyHistory?: string;
  documentType: string;
  dni: string;
}

export interface UpdatePatientRequest {
  firstName?: string;
  lastNamePaternal?: string;
  lastNameMaternal?: string;
  birthDate?: string;
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
  lastDentistVisit?: string;
  lastVisitTreatment?: string;
  familyHistory?: string;
  documentType?: string;
  dni?: string;
  email?: string;
}

export interface CreateMedicalHistoryRequest {
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
  anesthesiaReactions?: boolean;
  currentMedications?: string;
}

export interface CreateHygieneHabitsRequest {
  usesToothbrush?: boolean;
  brushingFrequency?: string;
  usesDentalFloss?: boolean;
  usesToothpick?: boolean;
  brushesTongue?: boolean;
  usesMouthwash?: boolean;
}

export interface CreateClinicalExamRequest {
  tartar?: boolean;
  saburra?: boolean;
  bacterialPlaque?: boolean;
  halitosis?: boolean;
  occlusion?: string;
}

export interface CreateOdontogramEntryRequest {
  toothNumber: number;
  toothType?: string;
  toothCondition: string;
  diagnosisDescription: string;
  xrayRequested?: boolean;
  treatmentId?: string;
  customPrice?: number;
  notes?: string;
}

export interface CreateOdontogramEntriesRequest {
  entries: CreateOdontogramEntryRequest[];
}
