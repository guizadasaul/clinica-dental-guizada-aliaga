import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AdminDoctorsService } from './admin-doctors.service';
import { AdminDoctorRepository } from '../domain/AdminDoctorRepository';
import { PatientInvitesService } from '../../patient-invites/application/patient-invites.service';
import type { AdminDoctorDetail } from '../domain/AdminDoctor';

const mockAdminDoctorRepo = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  deactivate: jest.fn(),
};

const mockPatientInvitesService = {
  createInviteForUser: jest.fn(),
};

const DOCTOR: AdminDoctorDetail = {
  id: 'doctor-1',
  displayName: 'Juan Perez',
  firstName: 'Juan',
  lastNamePaternal: 'Perez',
  lastNameMaternal: null,
  registrationStatus: 'pending',
  email: 'juan@example.com',
  phone: '+59170011122',
  specialty: 'Ortodoncia',
  bio: null,
  photoUrl: null,
  displayOrder: 0,
  isBookable: true,
  isActive: true,
  scheduleBlocks: [],
};

describe('AdminDoctorsService', () => {
  let service: AdminDoctorsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AdminDoctorsService,
        { provide: AdminDoctorRepository, useValue: mockAdminDoctorRepo },
        { provide: PatientInvitesService, useValue: mockPatientInvitesService },
      ],
    }).compile();
    service = module.get(AdminDoctorsService);
  });

  describe('findAll', () => {
    it('delegates to the repository', async () => {
      mockAdminDoctorRepo.findAll.mockResolvedValue([DOCTOR]);

      const result = await service.findAll();

      expect(result).toEqual([DOCTOR]);
    });
  });

  describe('findById', () => {
    it('throws NotFoundException when the repository returns null', async () => {
      mockAdminDoctorRepo.findById.mockResolvedValue(null);

      await expect(service.findById('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the doctor on the happy path', async () => {
      mockAdminDoctorRepo.findById.mockResolvedValue(DOCTOR);

      expect(await service.findById('doctor-1')).toEqual(DOCTOR);
    });
  });

  describe('createDoctor', () => {
    const CREATE_DATA = {
      displayName: 'Juan Perez',
      firstName: 'Juan',
      lastNamePaternal: 'Perez',
      lastNameMaternal: null,
      email: 'juan@example.com',
      phone: '+59170011122',
      specialty: 'Ortodoncia',
      bio: null,
      photoUrl: null,
      displayOrder: null,
      scheduleBlocks: [],
    };

    it('creates the doctor and sends the invite email tagged kind=doctor, reporting inviteSent=true', async () => {
      mockAdminDoctorRepo.create.mockResolvedValue(DOCTOR);
      mockPatientInvitesService.createInviteForUser.mockResolvedValue({});

      const result = await service.createDoctor(CREATE_DATA);

      expect(mockAdminDoctorRepo.create).toHaveBeenCalledWith(CREATE_DATA);
      expect(
        mockPatientInvitesService.createInviteForUser,
      ).toHaveBeenCalledWith(
        'doctor-1',
        'email',
        {
          fullName: 'Juan Perez',
          phone: '+59170011122',
          email: 'juan@example.com',
        },
        'doctor',
      );
      expect(result).toEqual({ doctor: DOCTOR, inviteSent: true });
    });

    it('still returns the created doctor with inviteSent=false when the invite email fails, without throwing', async () => {
      mockAdminDoctorRepo.create.mockResolvedValue(DOCTOR);
      mockPatientInvitesService.createInviteForUser.mockRejectedValue(
        new Error('Resend caído'),
      );

      const result = await service.createDoctor(CREATE_DATA);

      expect(result).toEqual({ doctor: DOCTOR, inviteSent: false });
    });

    it('never calls the invite service if the repository create itself fails (no doctor to invite)', async () => {
      mockAdminDoctorRepo.create.mockRejectedValue(new Error('email en uso'));

      await expect(service.createDoctor(CREATE_DATA)).rejects.toThrow(
        'email en uso',
      );
      expect(
        mockPatientInvitesService.createInviteForUser,
      ).not.toHaveBeenCalled();
    });
  });

  describe('updateDoctor', () => {
    it('throws NotFoundException when the repository returns null', async () => {
      mockAdminDoctorRepo.update.mockResolvedValue(null);

      await expect(
        service.updateDoctor('missing', { displayName: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns the updated doctor on the happy path', async () => {
      mockAdminDoctorRepo.update.mockResolvedValue(DOCTOR);

      const result = await service.updateDoctor('doctor-1', {
        specialty: 'Endodoncia',
      });

      expect(mockAdminDoctorRepo.update).toHaveBeenCalledWith('doctor-1', {
        specialty: 'Endodoncia',
      });
      expect(result).toEqual(DOCTOR);
    });
  });

  describe('deactivateDoctor', () => {
    it('throws NotFoundException when the repository returns null', async () => {
      mockAdminDoctorRepo.deactivate.mockResolvedValue(null);

      await expect(service.deactivateDoctor('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the deactivated doctor on the happy path', async () => {
      const deactivated = { ...DOCTOR, isBookable: false, isActive: false };
      mockAdminDoctorRepo.deactivate.mockResolvedValue(deactivated);

      expect(await service.deactivateDoctor('doctor-1')).toEqual(deactivated);
    });
  });
});
