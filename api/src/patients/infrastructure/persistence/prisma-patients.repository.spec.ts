import { PrismaPatientsRepository } from './prisma-patients.repository';
import type { OdontogramEntryData } from '../../domain/PatientRepository';

// Regresión CLI-39: antes de este cambio, createOdontogramEntries hacía
// `deleteMany({ where: { patient_id } })` sin acotar por treatment_id, así
// que reguardar el odontograma del wizard borraba también las entries
// generadas por createToothProcedure (CLI-15). El fix acota el DELETE a
// `treatment_id: null` y corre todo dentro de una transacción.

function makeMockTx() {
  return {
    odontogram_entries: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    medical_history: {
      upsert: jest.fn().mockResolvedValue({}),
      findUniqueOrThrow: jest.fn().mockResolvedValue(fakeMedicalHistoryRow()),
    },
    patient_medical_conditions: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    patient_medications: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    application_groups: {
      create: jest.fn(),
    },
    tooth_procedures: {
      create: jest.fn(),
    },
  };
}

function makeMockPrismaService(mockTx: ReturnType<typeof makeMockTx>) {
  return {
    transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(mockTx)),
    clinical_exams: {
      upsert: jest.fn(),
    },
    medical_history: {
      findUnique: jest.fn(),
    },
    patient_medical_conditions: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    patient_medications: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

function fakeMedicalHistoryRow() {
  return {
    id: 'mh-1',
    patient_id: 'patient-1',
    other_diseases: null,
    gestation_lmp_date: null,
    anesthesia_reactions: null,
    updated_at: new Date('2026-09-15'),
  };
}

const entry: OdontogramEntryData = {
  toothNumber: 11,
  toothCondition: 'sano',
  diagnosisDescription: 'Diente sano',
};

describe('PrismaPatientsRepository.createOdontogramEntries', () => {
  it('borra únicamente las entries del chart (treatment_id: null), nunca las de tratamientos', async () => {
    const mockTx = makeMockTx();
    const mockPrisma = makeMockPrismaService(mockTx);
    const repo = new PrismaPatientsRepository(mockPrisma as never);

    await repo.createOdontogramEntries('patient-1', [entry]);

    expect(mockTx.odontogram_entries.deleteMany).toHaveBeenCalledWith({
      where: { patient_id: 'patient-1', treatment_id: null },
    });
  });

  it('nunca borra sin acotar por treatment_id', async () => {
    const mockTx = makeMockTx();
    const mockPrisma = makeMockPrismaService(mockTx);
    const repo = new PrismaPatientsRepository(mockPrisma as never);

    await repo.createOdontogramEntries('patient-1', [entry]);

    const [[{ where }]] = mockTx.odontogram_entries.deleteMany.mock.calls as [
      [{ where: Record<string, unknown> }],
    ];
    expect(where).toHaveProperty('treatment_id', null);
  });

  it('corre el delete + insert dentro de una transacción', async () => {
    const mockTx = makeMockTx();
    const mockPrisma = makeMockPrismaService(mockTx);
    const repo = new PrismaPatientsRepository(mockPrisma as never);

    await repo.createOdontogramEntries('patient-1', [entry]);

    expect(mockPrisma.transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.odontogram_entries.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          patient_id: 'patient-1',
          tooth_number: 11,
          diagnosis_description: 'Diente sano',
          treatment_id: null,
        }),
      ],
    });
  });

  it('no llama a createMany si entries viene vacío, pero igual borra y devuelve lo que queda', async () => {
    const mockTx = makeMockTx();
    const mockPrisma = makeMockPrismaService(mockTx);
    const repo = new PrismaPatientsRepository(mockPrisma as never);

    await repo.createOdontogramEntries('patient-1', []);

    expect(mockTx.odontogram_entries.deleteMany).toHaveBeenCalledWith({
      where: { patient_id: 'patient-1', treatment_id: null },
    });
    expect(mockTx.odontogram_entries.createMany).not.toHaveBeenCalled();
  });
});

describe('PrismaPatientsRepository.createClinicalExam', () => {
  it('hace upsert sobre (patient_id, exam_date) en vez de un create plano', async () => {
    const mockTx = makeMockTx();
    const mockPrisma = makeMockPrismaService(mockTx);
    mockPrisma.clinical_exams.upsert.mockResolvedValue({
      id: 'exam-1',
      patient_id: 'patient-1',
      tartar: false,
      saburra: false,
      bacterial_plaque: false,
      halitosis: false,
      occlusion: null,
      exam_date: new Date('2026-08-23'),
      created_at: new Date('2026-08-23'),
    });
    const repo = new PrismaPatientsRepository(mockPrisma as never);

    await repo.createClinicalExam('patient-1', { tartar: true });

    expect(mockPrisma.clinical_exams.upsert).toHaveBeenCalledTimes(1);
    const [{ where }] = mockPrisma.clinical_exams.upsert.mock.calls[0] as [
      { where: { patient_id_exam_date: unknown } },
    ];
    expect(where).toHaveProperty('patient_id_exam_date');
    const key = where.patient_id_exam_date as {
      patient_id: string;
      exam_date: Date;
    };
    expect(key.patient_id).toBe('patient-1');
    expect(key.exam_date).toBeInstanceOf(Date);
  });
});

// CLI-50: upsertMedicalHistory reemplaza el conjunto completo de condiciones
// y medicación en cada guardado (igual semántica que los 10 booleanos que
// reemplaza) — se borra y se recrea dentro de la misma transacción.
describe('PrismaPatientsRepository.upsertMedicalHistory', () => {
  it('runs the upsert + condition/medication replace inside one transaction', async () => {
    const mockTx = makeMockTx();
    const mockPrisma = makeMockPrismaService(mockTx);
    const repo = new PrismaPatientsRepository(mockPrisma as never);

    await repo.upsertMedicalHistory('patient-1', {});

    expect(mockPrisma.transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.medical_history.upsert).toHaveBeenCalledTimes(1);
  });

  it('deletes and recreates conditions, scoped to the patient', async () => {
    const mockTx = makeMockTx();
    const mockPrisma = makeMockPrismaService(mockTx);
    const repo = new PrismaPatientsRepository(mockPrisma as never);

    await repo.upsertMedicalHistory('patient-1', {
      conditions: [
        { medicalConditionId: 'cond-1', diagnosedAt: new Date('2020-01-01') },
      ],
    });

    expect(mockTx.patient_medical_conditions.deleteMany).toHaveBeenCalledWith({
      where: { patient_id: 'patient-1' },
    });
    expect(mockTx.patient_medical_conditions.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          patient_id: 'patient-1',
          medical_condition_id: 'cond-1',
        }),
      ],
    });
  });

  it('does not call createMany for conditions/medications when neither is sent', async () => {
    const mockTx = makeMockTx();
    const mockPrisma = makeMockPrismaService(mockTx);
    const repo = new PrismaPatientsRepository(mockPrisma as never);

    await repo.upsertMedicalHistory('patient-1', {});

    expect(mockTx.patient_medical_conditions.deleteMany).toHaveBeenCalled();
    expect(mockTx.patient_medical_conditions.createMany).not.toHaveBeenCalled();
    expect(mockTx.patient_medications.deleteMany).toHaveBeenCalled();
    expect(mockTx.patient_medications.createMany).not.toHaveBeenCalled();
  });

  it('deletes and recreates medications, scoped to the patient', async () => {
    const mockTx = makeMockTx();
    const mockPrisma = makeMockPrismaService(mockTx);
    const repo = new PrismaPatientsRepository(mockPrisma as never);

    await repo.upsertMedicalHistory('patient-1', {
      medications: [{ drugName: 'Metformina', dose: '850mg' }],
    });

    expect(mockTx.patient_medications.deleteMany).toHaveBeenCalledWith({
      where: { patient_id: 'patient-1' },
    });
    expect(mockTx.patient_medications.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          patient_id: 'patient-1',
          drug_name: 'Metformina',
          dose: '850mg',
        }),
      ],
    });
  });
});

describe('PrismaPatientsRepository.findMedicalHistory', () => {
  it('returns null without querying conditions/medications when no history exists', async () => {
    const mockTx = makeMockTx();
    const mockPrisma = makeMockPrismaService(mockTx);
    mockPrisma.medical_history.findUnique.mockResolvedValue(null);
    const repo = new PrismaPatientsRepository(mockPrisma as never);

    const result = await repo.findMedicalHistory('patient-1');

    expect(result).toBeNull();
    expect(mockPrisma.patient_medical_conditions.findMany).not.toHaveBeenCalled();
  });

  it('combines the three separate queries into one record', async () => {
    const mockTx = makeMockTx();
    const mockPrisma = makeMockPrismaService(mockTx);
    mockPrisma.medical_history.findUnique.mockResolvedValue(
      fakeMedicalHistoryRow(),
    );
    mockPrisma.patient_medical_conditions.findMany.mockResolvedValue([
      {
        id: 'pmc-1',
        patient_id: 'patient-1',
        medical_condition_id: 'cond-1',
        diagnosed_at: null,
        notes: null,
        created_at: new Date(),
        medical_conditions: {
          id: 'cond-1',
          code: 'diabetes',
          name: 'Diabetes',
          display_order: 0,
          is_active: true,
        },
      },
    ]);
    const repo = new PrismaPatientsRepository(mockPrisma as never);

    const result = await repo.findMedicalHistory('patient-1');

    expect(result?.conditions).toEqual([
      { code: 'diabetes', name: 'Diabetes', diagnosedAt: null, notes: null },
    ]);
  });
});

// CLI-53: mismo criterio que PrismaQuotesRepository.addItemGroup — el precio
// vive una sola vez en application_groups, las filas de tooth_procedures no
// tienen precio propio.
describe('PrismaPatientsRepository.createToothProcedureGroup', () => {
  it('creates the application_groups row first, then one tooth_procedures row per tooth pointing at it, without price on the rows', async () => {
    const mockTx = makeMockTx();
    mockTx.application_groups.create.mockResolvedValue({ id: 'group-1' });
    mockTx.tooth_procedures.create.mockResolvedValue({
      id: 'proc-1',
      application_groups: { id: 'group-1', unit_price: 1700 },
      tooth_procedure_surfaces: [],
    });
    const mockPrisma = makeMockPrismaService(mockTx);
    const repo = new PrismaPatientsRepository(mockPrisma as never);

    await repo.createToothProcedureGroup('patient-1', {
      treatmentId: 'treatment-1',
      teeth: [
        { toothNumber: 16, surfaceCodes: ['occlusal'] },
        { toothNumber: 17 },
      ],
      priceCharged: 1700,
      performedBy: 'doctor-1',
    });

    expect(mockTx.application_groups.create).toHaveBeenCalledWith({
      data: {
        treatment_id: 'treatment-1',
        unit_price: 1700,
        subtotal: 1700,
        currency: 'BOB',
      },
    });
    expect(mockTx.tooth_procedures.create).toHaveBeenCalledTimes(2);
    const firstCallArgs = mockTx.tooth_procedures.create.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(firstCallArgs[0].data).toEqual(
      expect.objectContaining({
        patient_id: 'patient-1',
        tooth_number: 16,
        application_group_id: 'group-1',
        treatment_id: 'treatment-1',
        tooth_procedure_surfaces: {
          create: [{ tooth_surfaces: { connect: { code: 'occlusal' } } }],
        },
        performed_by: 'doctor-1',
      }),
    );
    // A diferencia del viejo esquema, ninguna llamada a tooth_procedures.create
    // incluye price_charged — el precio vive solo en application_groups.
    expect(firstCallArgs[0].data).not.toHaveProperty('price_charged');
  });
});
