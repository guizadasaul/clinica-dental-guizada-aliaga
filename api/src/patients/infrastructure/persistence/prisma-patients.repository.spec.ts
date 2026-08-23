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
  };
}

function makeMockPrismaService(mockTx: ReturnType<typeof makeMockTx>) {
  return {
    transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(mockTx)),
    clinical_exams: {
      upsert: jest.fn(),
    },
  };
}

const entry: OdontogramEntryData = {
  toothNumber: 11,
  diagnosisType: 'definitivo',
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
