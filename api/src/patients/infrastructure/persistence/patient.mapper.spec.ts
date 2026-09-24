import { PatientMapper } from './patient.mapper';

type PatientRecord = Parameters<typeof PatientMapper.toDomainPatient>[0];
type MedicalHistoryRecord = Parameters<
  typeof PatientMapper.toDomainMedicalHistory
>[0];
type ClinicalExamRecord = Parameters<
  typeof PatientMapper.toDomainClinicalExam
>[0];
type UserRecord = Parameters<typeof PatientMapper.toDomainPatientWithUser>[0];

const CREATED = new Date('2026-09-01T12:00:00Z');
const UPDATED = new Date('2026-09-02T12:00:00Z');

function patientRow(overrides: Partial<PatientRecord> = {}): PatientRecord {
  return {
    id: 'patient-1',
    user_id: 'user-1',
    first_name: 'Ana',
    last_name_paternal: 'Pérez',
    last_name_maternal: null,
    birth_date: null,
    birth_place: null,
    sex: null,
    occupation: null,
    address: null,
    zona: null,
    ciudad: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    emergency_contact_relationship: null,
    consultation_reason: null,
    last_dentist_visit: null,
    last_visit_treatment: null,
    family_history: null,
    document_type: null,
    dni: null,
    created_at: CREATED,
    updated_at: UPDATED,
    assigned_doctor_id: null,
    users: { phone: null },
    ...overrides,
  };
}

describe('PatientMapper.toDomainPatient', () => {
  it('toma el teléfono de users y deja en null lo opcional vacío', () => {
    const patient = PatientMapper.toDomainPatient(patientRow());

    expect(patient).toMatchObject({
      id: 'patient-1',
      userId: 'user-1',
      firstName: 'Ana',
      lastNamePaternal: 'Pérez',
      lastNameMaternal: null,
      phone: null,
      dni: null,
      assignedDoctorId: null,
      createdAt: CREATED,
      updatedAt: UPDATED,
    });
  });

  it('pasa todos los datos cargados', () => {
    const birthDate = new Date('1990-05-01');
    const patient = PatientMapper.toDomainPatient(
      patientRow({
        last_name_maternal: 'Rojas',
        birth_date: birthDate,
        ciudad: 'La Paz',
        dni: '1234567',
        document_type: 'ci',
        assigned_doctor_id: 'doctor-1',
        users: { phone: '+59170000000' },
      }),
    );

    expect(patient).toMatchObject({
      lastNameMaternal: 'Rojas',
      birthDate,
      ciudad: 'La Paz',
      dni: '1234567',
      documentType: 'ci',
      assignedDoctorId: 'doctor-1',
      phone: '+59170000000',
    });
  });
});

describe('PatientMapper.toDomainMedicalHistory', () => {
  const base = {
    id: 'mh-1',
    patient_id: 'patient-1',
    other_diseases: null,
    gestation_lmp_date: null,
    anesthesia_reactions: null,
    updated_at: UPDATED,
    patient_medical_conditions: [],
    patient_medications: [],
  };

  it('sin gestación no calcula trimestre', () => {
    const history = PatientMapper.toDomainMedicalHistory(base);

    expect(history).toEqual({
      id: 'mh-1',
      patientId: 'patient-1',
      conditions: [],
      otherDiseases: null,
      gestationLmpDate: null,
      gestationTrimester: null,
      anesthesiaReactions: null,
      medications: [],
      updatedAt: UPDATED,
    });
  });

  it('mapea condiciones, medicación y el trimestre de gestación', () => {
    const lmp = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    const history = PatientMapper.toDomainMedicalHistory({
      ...base,
      gestation_lmp_date: lmp,
      patient_medical_conditions: [
        {
          diagnosed_at: new Date('2020-01-01'),
          notes: 'tipo 2',
          medical_conditions: { code: 'diabetes', name: 'Diabetes' },
        },
        {
          diagnosed_at: null,
          notes: null,
          medical_conditions: { code: 'asma', name: 'Asma' },
        },
      ],
      patient_medications: [
        {
          id: 'med-1',
          drug_name: 'Metformina',
          dose: null,
          frequency: null,
          started_at: null,
        },
      ],
    } as unknown as MedicalHistoryRecord);

    expect(history.gestationLmpDate).toBe(lmp);
    expect(history.gestationTrimester).toBe(1);
    expect(history.conditions).toEqual([
      {
        code: 'diabetes',
        name: 'Diabetes',
        diagnosedAt: new Date('2020-01-01'),
        notes: 'tipo 2',
      },
      { code: 'asma', name: 'Asma', diagnosedAt: null, notes: null },
    ]);
    expect(history.medications).toEqual([
      {
        id: 'med-1',
        drugName: 'Metformina',
        dose: null,
        frequency: null,
        startedAt: null,
      },
    ]);
  });
});

describe('PatientMapper.toDomainHygieneHabits', () => {
  it('mapea los hábitos y deja en null la frecuencia vacía', () => {
    const habits = PatientMapper.toDomainHygieneHabits({
      id: 'hh-1',
      patient_id: 'patient-1',
      uses_toothbrush: true,
      brushing_frequency: null,
      uses_dental_floss: false,
      uses_toothpick: true,
      brushes_tongue: false,
      uses_mouthwash: true,
      updated_at: UPDATED,
    });

    expect(habits).toMatchObject({
      id: 'hh-1',
      patientId: 'patient-1',
      usesToothbrush: true,
      brushingFrequency: null,
      usesDentalFloss: false,
      usesToothpick: true,
      brushesTongue: false,
      usesMouthwash: true,
      updatedAt: UPDATED,
    });
  });
});

describe('PatientMapper.toDomainClinicalExam', () => {
  it('mapea el examen y deja en null la oclusión vacía', () => {
    const examDate = new Date('2026-09-10');
    const exam = PatientMapper.toDomainClinicalExam({
      id: 'ce-1',
      patient_id: 'patient-1',
      tartar: 'leve',
      saburra: 'no',
      bacterial_plaque: 'moderada',
      halitosis: 'no',
      occlusion: null,
      exam_date: examDate,
      created_at: CREATED,
    } as unknown as ClinicalExamRecord);

    expect(exam).toMatchObject({
      id: 'ce-1',
      tartar: 'leve',
      bacterialPlaque: 'moderada',
      occlusion: null,
      examDate,
    });
  });
});

describe('PatientMapper.toDomainPatientWithUser', () => {
  const user = {
    id: 'user-1',
    display_name: 'Ana Pérez',
    email: 'ana@example.com',
    phone: '+59170000000',
    created_at: CREATED,
    auth_user_id: 'auth-1',
  };

  it('usuario con ficha: embebe el paciente con el teléfono del usuario', () => {
    const result = PatientMapper.toDomainPatientWithUser({
      ...user,
      patients: { ...patientRow(), _count: { dental_exams: 2 } },
    } as unknown as UserRecord);

    expect(result).toMatchObject({
      userId: 'user-1',
      displayName: 'Ana Pérez',
      email: 'ana@example.com',
      phone: '+59170000000',
      dentalExamsCount: 2,
      hasAccount: true,
    });
    expect(result.patient).toMatchObject({
      id: 'patient-1',
      phone: '+59170000000',
    });
  });

  it('usuario sin ficha ni cuenta de Auth (invitado todavía no registrado)', () => {
    const result = PatientMapper.toDomainPatientWithUser({
      ...user,
      display_name: null,
      email: null,
      phone: null,
      auth_user_id: null,
      patients: null,
    } as unknown as UserRecord);

    expect(result).toMatchObject({
      displayName: null,
      email: null,
      phone: null,
      patient: null,
      dentalExamsCount: 0,
      hasAccount: false,
    });
  });
});
