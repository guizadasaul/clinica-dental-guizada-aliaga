import {
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

const mockPatientRepo = {
  findAllWithUsers: jest.fn(),
  findPatientById: jest.fn(),
  findByUserId: jest.fn(),
  create: jest.fn(),
  updatePatient: jest.fn(),
  upsertMedicalHistory: jest.fn(),
  upsertHygieneHabits: jest.fn(),
  createClinicalExam: jest.fn(),
  createOdontogramEntries: jest.fn(),
  findOdontogramEntries: jest.fn(),
  createToothProcedure: jest.fn(),
  findToothProcedures: jest.fn(),
};

const mockUserRepo = {
  findByAuthUserId: jest.fn(),
  upsertByAuthUserId: jest.fn(),
  createPlaceholder: jest.fn(),
  linkAuthIdentity: jest.fn(),
  updateContactInfo: jest.fn(),
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
});
