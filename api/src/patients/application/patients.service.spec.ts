import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PatientsService } from './patients.service';
import { PatientRepository } from '../domain/PatientRepository';
import { Patient } from '../domain/Patient';
import { UserRepository } from '../../auth/domain/UserRepository';
import { User } from '../../auth/domain/User';
import { UserRole } from '../../auth/domain/value-objects/UserRole';
import { TreatmentRepository } from '../../treatments/domain/TreatmentRepository';
import type { Treatment } from '../../treatments/domain/Treatment';
import type { TreatmentScope } from '../../treatments/domain/TreatmentScope';
import { DiagnosisRepository } from '../../diagnoses/domain/DiagnosisRepository';
import type { Diagnosis } from '../../diagnoses/domain/Diagnosis';
import { SupabaseAdminService } from '../../auth/infrastructure/SupabaseAdminService';

const DOCTOR_AUTH_ID = 'doctor-auth-1';
const PATIENT_AUTH_ID = 'patient-auth-1';

function makeAppUser(role: UserRole, id: string): User {
  return new User(
    id,
    `${id}-auth`,
    'x@example.com',
    role,
    'Name',
    null,
    null,
    true,
    new Date(),
    new Date(),
  );
}

function fakePatient(
  overrides: Partial<{
    id: string;
    userId: string;
    authUserId: string | null;
  }> = {},
): Patient {
  return new Patient(
    overrides.id ?? 'patient-1',
    overrides.userId ?? 'user-1',
    'Juana',
    'Perez',
    null,
    null,
    null,
    null,
    null,
    null,
    '70011122',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    new Date(),
    new Date(),
  );
}

function fakeDiagnosis(overrides: Partial<Diagnosis> = {}): Diagnosis {
  return {
    id: 'diagnosis-1',
    categoryId: 'category-1',
    code: 'caries_segundo_grado',
    name: 'Caries de segundo grado',
    scope: 'single_tooth',
    modifier: 'black_class',
    color: '#dc2626',
    displayOrder: 0,
    ...overrides,
  };
}

function fakeTreatment(overrides: Partial<Treatment> = {}): Treatment {
  return {
    id: 'treatment-1',
    name: 'Tratamiento',
    description: null,
    basePrice: 100,
    estimatedMinutes: 30,
    scope: 'tooth',
    currency: 'BOB',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const mockPatientRepo = {
  findAllWithUsers: jest.fn(),
  findPatientById: jest.fn(),
  findByUserId: jest.fn(),
  create: jest.fn(),
  updatePatient: jest.fn(),
  upsertMedicalHistory: jest.fn(),
  findMedicalHistory: jest.fn(),
  upsertHygieneHabits: jest.fn(),
  findHygieneHabits: jest.fn(),
  createClinicalExam: jest.fn(),
  findLatestClinicalExam: jest.fn(),
  createOdontogramEntries: jest.fn(),
  findOdontogramEntries: jest.fn(),
  createToothProcedures: jest.fn(),
  findToothProcedures: jest.fn(),
  appendOdontogramEntries: jest.fn(),
  createDentalExam: jest.fn(),
  findDentalExamVersions: jest.fn(),
  findCurrentDentalExam: jest.fn(),
  findDentalExam: jest.fn(),
};

const mockUserRepo = {
  findByAuthUserId: jest.fn(),
  upsertByAuthUserId: jest.fn(),
  createPlaceholder: jest.fn(),
  linkAuthIdentity: jest.fn(),
  updateContactInfo: jest.fn(),
};

const mockTreatmentRepo = {
  findActive: jest.fn(),
  findById: jest.fn(),
  findDefaultConsultation: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

const mockSupabaseAdminService = {
  setConfirmedPhone: jest.fn(),
};

const mockDiagnosisRepo = {
  findCatalog: jest.fn(),
  findByCodes: jest.fn(),
};

describe('PatientsService', () => {
  let service: PatientsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PatientsService,
        { provide: PatientRepository, useValue: mockPatientRepo },
        { provide: UserRepository, useValue: mockUserRepo },
        { provide: TreatmentRepository, useValue: mockTreatmentRepo },
        { provide: DiagnosisRepository, useValue: mockDiagnosisRepo },
        { provide: SupabaseAdminService, useValue: mockSupabaseAdminService },
      ],
    }).compile();
    service = module.get(PatientsService);
  });

  describe('createPatient', () => {
    it('throws NotFoundException when the caller has no row in users', async () => {
      mockUserRepo.findByAuthUserId.mockResolvedValue(null);

      await expect(
        service.createPatient(PATIENT_AUTH_ID, undefined, {
          firstName: 'A',
          lastNamePaternal: 'B',
          birthDate: new Date(),
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('a patient targeting another userId is forbidden', async () => {
      mockUserRepo.findByAuthUserId.mockResolvedValue(
        makeAppUser(UserRole.PATIENT, 'caller-user-id'),
      );

      await expect(
        service.createPatient(PATIENT_AUTH_ID, 'someone-elses-user-id', {
          firstName: 'A',
          lastNamePaternal: 'B',
          birthDate: new Date(),
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPatientRepo.create).not.toHaveBeenCalled();
    });

    it('a patient with no requested userId creates the ficha under their own id', async () => {
      mockUserRepo.findByAuthUserId.mockResolvedValue(
        makeAppUser(UserRole.PATIENT, 'caller-user-id'),
      );
      mockPatientRepo.create.mockResolvedValue(
        fakePatient({ userId: 'caller-user-id' }),
      );

      await service.createPatient(PATIENT_AUTH_ID, undefined, {
        firstName: 'A',
        lastNamePaternal: 'B',
        birthDate: new Date(),
      });

      expect(mockPatientRepo.create).toHaveBeenCalledWith(
        'caller-user-id',
        expect.anything(),
      );
    });

    it('a patient targeting their own userId is allowed', async () => {
      mockUserRepo.findByAuthUserId.mockResolvedValue(
        makeAppUser(UserRole.PATIENT, 'caller-user-id'),
      );
      mockPatientRepo.create.mockResolvedValue(
        fakePatient({ userId: 'caller-user-id' }),
      );

      await service.createPatient(PATIENT_AUTH_ID, 'caller-user-id', {
        firstName: 'A',
        lastNamePaternal: 'B',
        birthDate: new Date(),
      });

      expect(mockPatientRepo.create).toHaveBeenCalledWith(
        'caller-user-id',
        expect.anything(),
      );
    });

    it('a doctor can create a ficha for an arbitrary userId (existing dashboard flow)', async () => {
      mockUserRepo.findByAuthUserId.mockResolvedValue(
        makeAppUser(UserRole.ODONTOLOGIST, 'doctor-id'),
      );
      mockPatientRepo.create.mockResolvedValue(
        fakePatient({ userId: 'some-other-user-id' }),
      );

      await service.createPatient(DOCTOR_AUTH_ID, 'some-other-user-id', {
        firstName: 'A',
        lastNamePaternal: 'B',
        birthDate: new Date(),
      });

      expect(mockPatientRepo.create).toHaveBeenCalledWith(
        'some-other-user-id',
        expect.anything(),
      );
    });

    it('translates a unique-constraint violation into ConflictException', async () => {
      mockUserRepo.findByAuthUserId.mockResolvedValue(
        makeAppUser(UserRole.ODONTOLOGIST, 'doctor-id'),
      );
      mockPatientRepo.create.mockRejectedValue(
        new Error('Unique constraint failed'),
      );

      await expect(
        service.createPatient(DOCTOR_AUTH_ID, 'some-user-id', {
          firstName: 'A',
          lastNamePaternal: 'B',
          birthDate: new Date(),
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updatePatient', () => {
    it('throws NotFoundException when the patient does not exist', async () => {
      mockPatientRepo.updatePatient.mockResolvedValue(null);

      await expect(
        service.updatePatient('missing', { firstName: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates the email on the linked user when provided', async () => {
      mockPatientRepo.updatePatient.mockResolvedValue(
        fakePatient({ userId: 'user-1' }),
      );

      await service.updatePatient('patient-1', {
        firstName: 'X',
        email: 'new@example.com',
      });

      expect(mockUserRepo.updateContactInfo).toHaveBeenCalledWith('user-1', {
        email: 'new@example.com',
      });
    });

    it('does not touch the user when no email is provided', async () => {
      mockPatientRepo.updatePatient.mockResolvedValue(
        fakePatient({ userId: 'user-1' }),
      );

      await service.updatePatient('patient-1', { firstName: 'X' });

      expect(mockUserRepo.updateContactInfo).not.toHaveBeenCalled();
    });

    it('propagates a ConflictException raised by a duplicate email', async () => {
      mockPatientRepo.updatePatient.mockResolvedValue(
        fakePatient({ userId: 'user-1' }),
      );
      mockUserRepo.updateContactInfo.mockRejectedValue(
        new ConflictException('El email ya está en uso'),
      );

      await expect(
        service.updatePatient('patient-1', { email: 'taken@example.com' }),
      ).rejects.toThrow(ConflictException);
    });

    it('syncs the phone onto the linked user when provided', async () => {
      mockPatientRepo.updatePatient.mockResolvedValue(
        fakePatient({ userId: 'user-1' }),
      );
      mockUserRepo.updateContactInfo.mockResolvedValue(
        makeAppUser(UserRole.PATIENT, 'user-1'),
      );

      await service.updatePatient('patient-1', {
        firstName: 'X',
        phone: '71234567',
      });

      expect(mockUserRepo.updateContactInfo).toHaveBeenCalledWith('user-1', {
        phone: '71234567',
      });
    });

    it('confirms the phone in Supabase Auth when the linked user already has an account', async () => {
      mockPatientRepo.updatePatient.mockResolvedValue(
        fakePatient({ userId: 'user-1' }),
      );
      const linkedUser = makeAppUser(UserRole.PATIENT, 'user-1');
      mockUserRepo.updateContactInfo.mockResolvedValue(linkedUser);

      await service.updatePatient('patient-1', { phone: '71234567' });

      expect(mockSupabaseAdminService.setConfirmedPhone).toHaveBeenCalledWith(
        linkedUser.authUserId,
        '+59171234567',
      );
    });

    it('does not confirm the phone in Supabase Auth when the linked user has no account yet', async () => {
      mockPatientRepo.updatePatient.mockResolvedValue(
        fakePatient({ userId: 'user-1' }),
      );
      mockUserRepo.updateContactInfo.mockResolvedValue(
        new User(
          'user-1',
          null,
          null,
          UserRole.PATIENT,
          'Name',
          '71234567',
          null,
          true,
          new Date(),
          new Date(),
        ),
      );

      await service.updatePatient('patient-1', { phone: '71234567' });

      expect(mockSupabaseAdminService.setConfirmedPhone).not.toHaveBeenCalled();
    });
  });

  describe('clinical history on a Patient whose linked user has no claimed account', () => {
    it('upsertMedicalHistory only depends on the patient existing, never on auth_user_id', async () => {
      mockPatientRepo.findPatientById.mockResolvedValue(fakePatient());
      mockPatientRepo.upsertMedicalHistory.mockResolvedValue({});

      await expect(
        service.upsertMedicalHistory('patient-1', { hasAllergies: true }),
      ).resolves.toBeDefined();
      expect(mockUserRepo.findByAuthUserId).not.toHaveBeenCalled();
    });
  });

  describe('createToothProcedure — reglas de alcance', () => {
    const baseInput = { treatmentId: 'treatment-1', priceCharged: 100 };

    beforeEach(() => {
      mockPatientRepo.findPatientById.mockResolvedValue(fakePatient());
      mockUserRepo.findByAuthUserId.mockResolvedValue(
        makeAppUser(UserRole.ODONTOLOGIST, 'doctor-1'),
      );
      mockPatientRepo.createToothProcedures.mockImplementation(
        (_patientId: string, rows: Record<string, unknown>[]) =>
          Promise.resolve(rows.map((r, i) => ({ id: `proc-${i}`, ...r }))),
      );
      mockPatientRepo.findOdontogramEntries.mockResolvedValue([]);
      mockPatientRepo.appendOdontogramEntries.mockResolvedValue([]);
    });

    it('rejects a nonexistent treatment with 404', async () => {
      mockTreatmentRepo.findById.mockResolvedValue(null);

      await expect(
        service.createToothProcedure('patient-1', 'doctor-auth-1', {
          ...baseInput,
          toothNumbers: [16],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    describe('scope: tooth', () => {
      beforeEach(() => {
        mockTreatmentRepo.findById.mockResolvedValue(
          fakeTreatment({ scope: 'tooth' }),
        );
      });

      it('rejects with no teeth', async () => {
        await expect(
          service.createToothProcedure('patient-1', 'doctor-auth-1', {
            ...baseInput,
            toothNumbers: [],
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects with 2 teeth', async () => {
        await expect(
          service.createToothProcedure('patient-1', 'doctor-auth-1', {
            ...baseInput,
            toothNumbers: [16, 17],
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('creates a single row with applicationGroupId null', async () => {
        const result = await service.createToothProcedure(
          'patient-1',
          'doctor-auth-1',
          { ...baseInput, toothNumbers: [16] },
        );

        expect(result).toHaveLength(1);
        expect(mockPatientRepo.createToothProcedures).toHaveBeenCalledWith(
          'patient-1',
          [
            expect.objectContaining({
              toothNumber: 16,
              applicationGroupId: null,
              priceCharged: 100,
            }),
          ],
        );
      });
    });

    describe('scope: multi_tooth', () => {
      beforeEach(() => {
        mockTreatmentRepo.findById.mockResolvedValue(
          fakeTreatment({ scope: 'multi_tooth' }),
        );
      });

      it('rejects with a single tooth', async () => {
        await expect(
          service.createToothProcedure('patient-1', 'doctor-auth-1', {
            ...baseInput,
            toothNumbers: [16],
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('creates one row per tooth sharing an applicationGroupId, price only on the lowest tooth', async () => {
        await service.createToothProcedure('patient-1', 'doctor-auth-1', {
          ...baseInput,
          toothNumbers: [18, 16, 17],
        });

        const [, rows] = mockPatientRepo.createToothProcedures.mock
          .calls[0] as [
          string,
          {
            toothNumber: number;
            applicationGroupId: string;
            priceCharged: number;
          }[],
        ];
        expect(rows).toHaveLength(3);
        expect(rows.map((r) => r.toothNumber)).toEqual([16, 17, 18]);
        expect(new Set(rows.map((r) => r.applicationGroupId)).size).toBe(1);
        expect(rows[0].priceCharged).toBe(100);
        expect(rows[1].priceCharged).toBe(0);
        expect(rows[2].priceCharged).toBe(0);
      });
    });

    describe.each([
      ['upper_arch', 16],
      ['lower_arch', 16],
      ['full_mouth', 32],
    ] as [TreatmentScope, number][])(
      'scope: %s',
      (scope, expectedTeethCount) => {
        beforeEach(() => {
          mockTreatmentRepo.findById.mockResolvedValue(
            fakeTreatment({ scope }),
          );
        });

        it('rejects when a tooth is specified', async () => {
          await expect(
            service.createToothProcedure('patient-1', 'doctor-auth-1', {
              ...baseInput,
              toothNumbers: [16],
            }),
          ).rejects.toThrow(BadRequestException);
        });

        it(`creates a single row with no tooth and generates ${expectedTeethCount} odontogram entries`, async () => {
          await service.createToothProcedure('patient-1', 'doctor-auth-1', {
            ...baseInput,
            toothNumbers: [],
          });

          expect(mockPatientRepo.createToothProcedures).toHaveBeenCalledWith(
            'patient-1',
            [expect.objectContaining({ toothNumber: null })],
          );
          expect(mockPatientRepo.appendOdontogramEntries).toHaveBeenCalledTimes(
            1,
          );
          const [, entries] = mockPatientRepo.appendOdontogramEntries.mock
            .calls[0] as [string, unknown[]];
          expect(entries).toHaveLength(expectedTeethCount);
        });
      },
    );

    describe('scope: none', () => {
      beforeEach(() => {
        mockTreatmentRepo.findById.mockResolvedValue(
          fakeTreatment({ scope: 'none' }),
        );
      });

      it('rejects when a tooth is specified', async () => {
        await expect(
          service.createToothProcedure('patient-1', 'doctor-auth-1', {
            ...baseInput,
            toothNumbers: [16],
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('creates a single row with no tooth and does not touch the odontogram', async () => {
        const result = await service.createToothProcedure(
          'patient-1',
          'doctor-auth-1',
          { ...baseInput, toothNumbers: [] },
        );

        expect(result).toHaveLength(1);
        expect(mockPatientRepo.appendOdontogramEntries).not.toHaveBeenCalled();
      });
    });
  });

  describe('createDentalExam', () => {
    const baseInput = {
      findings: [
        {
          diagnosisCode: 'caries_segundo_grado',
          toothNumbers: [16],
          modifierValue: 'clase_ii',
        },
      ],
    };

    beforeEach(() => {
      mockPatientRepo.findPatientById.mockResolvedValue(fakePatient());
      mockUserRepo.findByAuthUserId.mockResolvedValue(
        makeAppUser(UserRole.ODONTOLOGIST, 'doctor-1'),
      );
      mockDiagnosisRepo.findByCodes.mockResolvedValue([fakeDiagnosis()]);
      mockPatientRepo.createDentalExam.mockResolvedValue({
        id: 'exam-1',
        patientId: 'patient-1',
        version: 1,
        recordedBy: 'doctor-1',
        recordedByName: 'Name',
        recordedAt: new Date(),
        changeReason: null,
        notes: null,
        findings: [],
      });
    });

    it('rejects a nonexistent patient with 404', async () => {
      mockPatientRepo.findPatientById.mockResolvedValue(null);

      await expect(
        service.createDentalExam('patient-1', DOCTOR_AUTH_ID, baseInput),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an unauthenticated caller not found in the app DB', async () => {
      mockUserRepo.findByAuthUserId.mockResolvedValue(null);

      await expect(
        service.createDentalExam('patient-1', DOCTOR_AUTH_ID, baseInput),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an unknown diagnosisCode', async () => {
      mockDiagnosisRepo.findByCodes.mockResolvedValue([]);

      await expect(
        service.createDentalExam('patient-1', DOCTOR_AUTH_ID, baseInput),
      ).rejects.toThrow(BadRequestException);
    });

    it('passes recordedBy as the app user id (not the auth uid) to the repository', async () => {
      await service.createDentalExam('patient-1', DOCTOR_AUTH_ID, baseInput);

      const [patientId, recordedBy] = mockPatientRepo.createDentalExam.mock
        .calls[0] as [string, string, unknown];
      expect(patientId).toBe('patient-1');
      expect(recordedBy).toBe('doctor-1');
    });

    describe('scope: single_tooth', () => {
      it('rejects zero teeth', async () => {
        await expect(
          service.createDentalExam('patient-1', DOCTOR_AUTH_ID, {
            findings: [
              {
                diagnosisCode: 'caries_segundo_grado',
                toothNumbers: [],
                modifierValue: 'clase_ii',
              },
            ],
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects more than one tooth', async () => {
        await expect(
          service.createDentalExam('patient-1', DOCTOR_AUTH_ID, {
            findings: [
              {
                diagnosisCode: 'caries_segundo_grado',
                toothNumbers: [16, 17],
                modifierValue: 'clase_ii',
              },
            ],
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('sends a single finding row with no applicationGroupId', async () => {
        await service.createDentalExam('patient-1', DOCTOR_AUTH_ID, baseInput);

        const [, , data] = mockPatientRepo.createDentalExam.mock.calls[0] as [
          string,
          string,
          { findings: Record<string, unknown>[] },
        ];
        expect(data.findings).toHaveLength(1);
        expect(data.findings[0]).toMatchObject({
          diagnosisId: 'diagnosis-1',
          toothNumber: 16,
          toothType: 'permanent',
          applicationGroupId: undefined,
        });
      });
    });

    describe('scope: multiple_teeth', () => {
      beforeEach(() => {
        mockDiagnosisRepo.findByCodes.mockResolvedValue([
          fakeDiagnosis({
            code: 'gingivitis',
            scope: 'multiple_teeth',
            modifier: 'none',
          }),
        ]);
      });

      it('rejects zero teeth', async () => {
        await expect(
          service.createDentalExam('patient-1', DOCTOR_AUTH_ID, {
            findings: [{ diagnosisCode: 'gingivitis', toothNumbers: [] }],
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('shares one applicationGroupId across every tooth row', async () => {
        await service.createDentalExam('patient-1', DOCTOR_AUTH_ID, {
          findings: [
            { diagnosisCode: 'gingivitis', toothNumbers: [16, 17, 18] },
          ],
        });

        const [, , data] = mockPatientRepo.createDentalExam.mock.calls[0] as [
          string,
          string,
          { findings: { applicationGroupId?: string }[] },
        ];
        expect(data.findings).toHaveLength(3);
        const groupIds = new Set(
          data.findings.map((f) => f.applicationGroupId),
        );
        expect(groupIds.size).toBe(1);
        expect([...groupIds][0]).toBeDefined();
      });
    });

    describe('scope: general', () => {
      beforeEach(() => {
        mockDiagnosisRepo.findByCodes.mockResolvedValue([
          fakeDiagnosis({
            code: 'lesion_lengua',
            scope: 'general',
            modifier: 'none',
          }),
        ]);
      });

      it('rejects when teeth are specified', async () => {
        await expect(
          service.createDentalExam('patient-1', DOCTOR_AUTH_ID, {
            findings: [{ diagnosisCode: 'lesion_lengua', toothNumbers: [16] }],
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('creates a single toothless finding row', async () => {
        await service.createDentalExam('patient-1', DOCTOR_AUTH_ID, {
          findings: [{ diagnosisCode: 'lesion_lengua' }],
        });

        const [, , data] = mockPatientRepo.createDentalExam.mock.calls[0] as [
          string,
          string,
          { findings: Record<string, unknown>[] },
        ];
        expect(data.findings).toHaveLength(1);
        expect(data.findings[0]['toothNumber']).toBeUndefined();
        expect(data.findings[0]['diagnosisId']).toBe('diagnosis-1');
      });
    });

    describe('modifier rules', () => {
      it('rejects a modifierValue when the diagnosis has no modifier', async () => {
        mockDiagnosisRepo.findByCodes.mockResolvedValue([
          fakeDiagnosis({ code: 'endodoncia', modifier: 'none' }),
        ]);

        await expect(
          service.createDentalExam('patient-1', DOCTOR_AUTH_ID, {
            findings: [
              {
                diagnosisCode: 'endodoncia',
                toothNumbers: [16],
                modifierValue: 'clase_i',
              },
            ],
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects a missing black_class modifier', async () => {
        await expect(
          service.createDentalExam('patient-1', DOCTOR_AUTH_ID, {
            findings: [
              { diagnosisCode: 'caries_segundo_grado', toothNumbers: [16] },
            ],
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects a mobility_grade value on a black_class diagnosis', async () => {
        await expect(
          service.createDentalExam('patient-1', DOCTOR_AUTH_ID, {
            findings: [
              {
                diagnosisCode: 'caries_segundo_grado',
                toothNumbers: [16],
                modifierValue: 'grado_ii',
              },
            ],
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('accepts a matching mobility_grade modifier', async () => {
        mockDiagnosisRepo.findByCodes.mockResolvedValue([
          fakeDiagnosis({
            code: 'movilidad_dental',
            modifier: 'mobility_grade',
          }),
        ]);

        await expect(
          service.createDentalExam('patient-1', DOCTOR_AUTH_ID, {
            findings: [
              {
                diagnosisCode: 'movilidad_dental',
                toothNumbers: [21],
                modifierValue: 'grado_ii',
              },
            ],
          }),
        ).resolves.toBeDefined();
      });
    });
  });
});
