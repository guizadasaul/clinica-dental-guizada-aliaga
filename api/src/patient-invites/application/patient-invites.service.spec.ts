import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PatientInvitesService } from './patient-invites.service';
import { PatientInviteRepository } from '../domain/PatientInviteRepository';
import { EmailSender } from '../domain/EmailSender';

const mockInviteRepo = {
  create: jest.fn(),
  invalidatePendingForUser: jest.fn(),
  redeemByTokenHash: jest.fn(),
  findPatientContactInfo: jest.fn(),
  isTokenValid: jest.fn(),
};

const mockEmailSender = {
  sendInviteEmail: jest.fn(),
};

const CONTACT_WITH_BOTH = {
  userId: 'user-1',
  fullName: 'Juana Perez',
  phone: '70011122',
  email: 'juana@example.com',
};

describe('PatientInvitesService', () => {
  let service: PatientInvitesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PatientInvitesService,
        { provide: PatientInviteRepository, useValue: mockInviteRepo },
        { provide: EmailSender, useValue: mockEmailSender },
      ],
    }).compile();
    service = module.get(PatientInvitesService);
  });

  describe('createInvite', () => {
    it('throws NotFoundException when the patient does not exist', async () => {
      mockInviteRepo.findPatientContactInfo.mockResolvedValue(null);

      await expect(service.createInvite('missing', 'email')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException for channel=email when the patient has no email on file', async () => {
      mockInviteRepo.findPatientContactInfo.mockResolvedValue({
        ...CONTACT_WITH_BOTH,
        email: null,
      });

      await expect(service.createInvite('patient-1', 'email')).rejects.toThrow(
        ConflictException,
      );
      expect(mockInviteRepo.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException for channel=whatsapp when the patient has no phone on file', async () => {
      mockInviteRepo.findPatientContactInfo.mockResolvedValue({
        ...CONTACT_WITH_BOTH,
        phone: null,
      });

      await expect(
        service.createInvite('patient-1', 'whatsapp'),
      ).rejects.toThrow(ConflictException);
      expect(mockInviteRepo.create).not.toHaveBeenCalled();
    });

    it('creates the invite and sends an email on the happy path (channel=email)', async () => {
      mockInviteRepo.findPatientContactInfo.mockResolvedValue(
        CONTACT_WITH_BOTH,
      );
      mockInviteRepo.create.mockResolvedValue({});

      const result = await service.createInvite('patient-1', 'email');

      expect(mockInviteRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          patientId: 'patient-1',
          channel: 'email',
        }),
      );
      expect(mockEmailSender.sendInviteEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'juana@example.com',
          displayName: 'Juana Perez',
          kind: 'patient',
        }),
      );
      expect(result).toEqual({});
    });

    it('creates the invite and builds a wa.me URL on the happy path (channel=whatsapp), never sending from the backend', async () => {
      mockInviteRepo.findPatientContactInfo.mockResolvedValue(
        CONTACT_WITH_BOTH,
      );
      mockInviteRepo.create.mockResolvedValue({});

      const result = await service.createInvite('patient-1', 'whatsapp');

      expect(mockEmailSender.sendInviteEmail).not.toHaveBeenCalled();
      expect(result.whatsappUrl).toContain('https://wa.me/59170011122?text=');
    });

    it('normalizes a phone that already has the country code without duplicating it', async () => {
      mockInviteRepo.findPatientContactInfo.mockResolvedValue({
        ...CONTACT_WITH_BOTH,
        phone: '59170011122',
      });
      mockInviteRepo.create.mockResolvedValue({});

      const result = await service.createInvite('patient-1', 'whatsapp');

      expect(result.whatsappUrl).toContain('https://wa.me/59170011122?text=');
    });

    it('invalidates any pending invite for the user before creating the new one', async () => {
      mockInviteRepo.findPatientContactInfo.mockResolvedValue(
        CONTACT_WITH_BOTH,
      );
      mockInviteRepo.create.mockResolvedValue({});
      const callOrder: string[] = [];
      mockInviteRepo.invalidatePendingForUser.mockImplementation(() => {
        callOrder.push('invalidate');
        return Promise.resolve();
      });
      mockInviteRepo.create.mockImplementation(() => {
        callOrder.push('create');
        return Promise.resolve({});
      });

      await service.createInvite('patient-1', 'email');

      expect(mockInviteRepo.invalidatePendingForUser).toHaveBeenCalledWith(
        'user-1',
        expect.any(Date),
      );
      expect(callOrder).toEqual(['invalidate', 'create']);
    });

    it('stores only the hash of the raw token, never the raw token itself', async () => {
      mockInviteRepo.findPatientContactInfo.mockResolvedValue(
        CONTACT_WITH_BOTH,
      );
      mockInviteRepo.create.mockResolvedValue({});

      await service.createInvite('patient-1', 'email');

      const calls = mockInviteRepo.create.mock.calls as [
        { tokenHash: string },
      ][];
      const [[createArg]] = calls;
      expect(createArg.tokenHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex digest
    });

    it('expires the invite 5 minutes from creation', async () => {
      mockInviteRepo.findPatientContactInfo.mockResolvedValue(
        CONTACT_WITH_BOTH,
      );
      mockInviteRepo.create.mockResolvedValue({});
      const before = Date.now();

      await service.createInvite('patient-1', 'email');

      const after = Date.now();
      const calls = mockInviteRepo.create.mock.calls as [{ expiresAt: Date }][];
      const [[createArg]] = calls;
      const ttlMs = createArg.expiresAt.getTime() - before;
      expect(ttlMs).toBeGreaterThanOrEqual(5 * 60 * 1000);
      expect(ttlMs).toBeLessThanOrEqual(5 * 60 * 1000 + (after - before));
    });
  });

  describe('createInviteForUser', () => {
    const DOCTOR_CONTACT = {
      fullName: 'Dr. Juan Gomez',
      phone: null,
      email: 'juan.gomez@example.com',
    };

    it('creates the invite for the given userId (no patientId) and sends an email tagged kind=doctor', async () => {
      mockInviteRepo.create.mockResolvedValue({});

      const result = await service.createInviteForUser(
        'user-doctor-1',
        'email',
        DOCTOR_CONTACT,
        'doctor',
      );

      expect(mockInviteRepo.findPatientContactInfo).not.toHaveBeenCalled();
      expect(mockInviteRepo.invalidatePendingForUser).toHaveBeenCalledWith(
        'user-doctor-1',
        expect.any(Date),
      );
      expect(mockInviteRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-doctor-1',
          patientId: null,
          channel: 'email',
        }),
      );
      expect(mockEmailSender.sendInviteEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'juan.gomez@example.com',
          displayName: 'Dr. Juan Gomez',
          kind: 'doctor',
        }),
      );
      expect(result).toEqual({});
    });

    it('throws ConflictException when the requested channel has no contact info', async () => {
      await expect(
        service.createInviteForUser(
          'user-doctor-1',
          'email',
          { ...DOCTOR_CONTACT, email: null },
          'doctor',
        ),
      ).rejects.toThrow(ConflictException);
      expect(mockInviteRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('redeem', () => {
    it('hashes the raw token before delegating to the repository', async () => {
      mockInviteRepo.redeemByTokenHash.mockResolvedValue({
        userId: 'u1',
        patientId: 'p1',
      });

      const result = await service.redeem('raw-token-value');

      const [hashArg] = mockInviteRepo.redeemByTokenHash.mock.calls[0] as [
        string,
        Date,
      ];
      expect(hashArg).toMatch(/^[0-9a-f]{64}$/);
      expect(hashArg).not.toBe('raw-token-value');
      expect(result).toEqual({ userId: 'u1', patientId: 'p1' });
    });

    it('returns null for an invalid/expired/already-used token', async () => {
      mockInviteRepo.redeemByTokenHash.mockResolvedValue(null);

      expect(await service.redeem('bad-token')).toBeNull();
    });
  });

  describe('checkStatus', () => {
    it('delegates to isTokenValid without consuming the token', async () => {
      mockInviteRepo.isTokenValid.mockResolvedValue(true);

      const result = await service.checkStatus('some-token');

      expect(result).toBe(true);
      expect(mockInviteRepo.redeemByTokenHash).not.toHaveBeenCalled();
    });
  });
});
