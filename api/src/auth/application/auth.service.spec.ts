import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UserRepository } from '../domain/UserRepository';
import { User } from '../domain/User';
import { UserRole } from '../domain/value-objects/UserRole';
import { AuthenticatedUser } from '../domain/AuthenticatedUser';
import { PatientInvitesService } from '../../patient-invites/application/patient-invites.service';
import { SupabaseAdminService } from '../infrastructure/SupabaseAdminService';

const AUTH_USER_ID = '11111111-1111-4111-8111-111111111111';

const mockUser = new User(
  'uuid-1',
  AUTH_USER_ID,
  'test@example.com',
  UserRole.PATIENT,
  'Test User',
  null,
  null,
  true,
  new Date(),
  new Date(),
);

const mockRepo = {
  upsertByAuthUserId: jest.fn(),
  findByAuthUserId: jest.fn(),
  createPlaceholder: jest.fn(),
  linkAuthIdentity: jest.fn(),
  updateContactInfo: jest.fn(),
};

const mockPatientInvitesService = {
  redeem: jest.fn(),
  createInvite: jest.fn(),
  checkStatus: jest.fn(),
};

const mockSupabaseAdminService = {
  setConfirmedPhone: jest.fn(),
  createPhoneUser: jest.fn(),
};

const authUser: AuthenticatedUser = {
  uid: AUTH_USER_ID,
  email: 'test@example.com',
  phone: null,
  displayName: 'Test User',
  photoUrl: null,
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserRepository, useValue: mockRepo },
        { provide: PatientInvitesService, useValue: mockPatientInvitesService },
        { provide: SupabaseAdminService, useValue: mockSupabaseAdminService },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  describe('syncUser', () => {
    it('updates and returns the user when a row already exists for this identity', async () => {
      mockRepo.findByAuthUserId.mockResolvedValue(mockUser);
      mockRepo.upsertByAuthUserId.mockResolvedValue(mockUser);

      const result = await service.syncUser(authUser);

      expect(result).toBe(mockUser);
      expect(mockRepo.findByAuthUserId).toHaveBeenCalledWith(AUTH_USER_ID);
      expect(mockRepo.upsertByAuthUserId).toHaveBeenCalledWith({
        authUserId: AUTH_USER_ID,
        email: 'test@example.com',
        displayName: 'Test User',
        photoUrl: null,
      });
    });

    it('does not create a row and throws NotFoundException for a brand-new login with no invite', async () => {
      mockRepo.findByAuthUserId.mockResolvedValue(null);

      await expect(service.syncUser(authUser)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockRepo.upsertByAuthUserId).not.toHaveBeenCalled();
    });

    it('should propagate repository errors', async () => {
      mockRepo.findByAuthUserId.mockResolvedValue(mockUser);
      mockRepo.upsertByAuthUserId.mockRejectedValue(new Error('DB error'));

      await expect(service.syncUser(authUser)).rejects.toThrow('DB error');
    });

    it('links the auth identity to the invited patient when the token redeems successfully', async () => {
      mockPatientInvitesService.redeem.mockResolvedValue({
        patientId: 'patient-1',
        userId: 'user-1',
      });
      mockRepo.linkAuthIdentity.mockResolvedValue(mockUser);

      const result = await service.syncUser(authUser, 'valid-invite-token');

      expect(mockPatientInvitesService.redeem).toHaveBeenCalledWith(
        'valid-invite-token',
      );
      expect(mockRepo.linkAuthIdentity).toHaveBeenCalledWith('user-1', {
        authUserId: AUTH_USER_ID,
        email: 'test@example.com',
        displayName: 'Test User',
        photoUrl: null,
      });
      expect(result).toBe(mockUser);
      expect(mockRepo.upsertByAuthUserId).not.toHaveBeenCalled();
      // mockUser.phone es null: no hay nada que confirmar en Supabase.
      expect(mockSupabaseAdminService.setConfirmedPhone).not.toHaveBeenCalled();
    });

    it('confirms the phone in Supabase Auth when the just-linked user already has one on file', async () => {
      mockPatientInvitesService.redeem.mockResolvedValue({
        patientId: 'patient-1',
        userId: 'user-1',
      });
      const linkedUserWithPhone = new User(
        'uuid-1',
        AUTH_USER_ID,
        'test@example.com',
        UserRole.PATIENT,
        'Test User',
        '71234567',
        null,
        true,
        new Date(),
        new Date(),
      );
      mockRepo.linkAuthIdentity.mockResolvedValue(linkedUserWithPhone);

      const result = await service.syncUser(authUser, 'valid-invite-token');

      expect(result).toBe(linkedUserWithPhone);
      expect(mockSupabaseAdminService.setConfirmedPhone).toHaveBeenCalledWith(
        AUTH_USER_ID,
        '+59171234567',
      );
    });

    it('threads the phone from the JWT through to upsertByAuthUserId when present', async () => {
      mockRepo.findByAuthUserId.mockResolvedValue(mockUser);
      mockRepo.upsertByAuthUserId.mockResolvedValue(mockUser);

      await service.syncUser({ ...authUser, phone: '+59171234567' });

      expect(mockRepo.upsertByAuthUserId).toHaveBeenCalledWith({
        authUserId: AUTH_USER_ID,
        email: 'test@example.com',
        phone: '+59171234567',
        displayName: 'Test User',
        photoUrl: null,
      });
    });

    it('falls back to a normal update when the invite token is invalid/expired/already used, for a user that already exists', async () => {
      mockPatientInvitesService.redeem.mockResolvedValue(null);
      mockRepo.findByAuthUserId.mockResolvedValue(mockUser);
      mockRepo.upsertByAuthUserId.mockResolvedValue(mockUser);

      const result = await service.syncUser(authUser, 'bad-invite-token');

      expect(mockRepo.linkAuthIdentity).not.toHaveBeenCalled();
      expect(result).toBe(mockUser);
      expect(mockRepo.upsertByAuthUserId).toHaveBeenCalledWith({
        authUserId: AUTH_USER_ID,
        email: 'test@example.com',
        displayName: 'Test User',
        photoUrl: null,
      });
    });

    it('throws NotFoundException when the invite token is invalid and there is no existing account either', async () => {
      mockPatientInvitesService.redeem.mockResolvedValue(null);
      mockRepo.findByAuthUserId.mockResolvedValue(null);

      await expect(
        service.syncUser(authUser, 'bad-invite-token'),
      ).rejects.toThrow(NotFoundException);
      expect(mockRepo.upsertByAuthUserId).not.toHaveBeenCalled();
    });

    it('still completes the login for an existing user when the invite seam itself throws', async () => {
      mockPatientInvitesService.redeem.mockRejectedValue(new Error('boom'));
      mockRepo.findByAuthUserId.mockResolvedValue(mockUser);
      mockRepo.upsertByAuthUserId.mockResolvedValue(mockUser);

      const result = await service.syncUser(authUser, 'some-token');

      expect(result).toBe(mockUser);
    });
  });

  describe('registerWithPhone', () => {
    it('normalizes the phone to E.164 before creating the Supabase user', async () => {
      mockPatientInvitesService.checkStatus.mockResolvedValue({ valid: true });
      mockSupabaseAdminService.createPhoneUser.mockResolvedValue({
        authUserId: 'new-uid',
      });

      await service.registerWithPhone('71234567', 'secret123', 'invite-token');

      expect(mockPatientInvitesService.checkStatus).toHaveBeenCalledWith(
        'invite-token',
      );
      expect(mockSupabaseAdminService.createPhoneUser).toHaveBeenCalledWith(
        '+59171234567',
        'secret123',
      );
    });

    it('does not redeem the invite (POST /auth/sync does it after login)', async () => {
      mockPatientInvitesService.checkStatus.mockResolvedValue({ valid: true });
      mockSupabaseAdminService.createPhoneUser.mockResolvedValue({
        authUserId: 'new-uid',
      });

      await service.registerWithPhone('71234567', 'secret123', 'invite-token');

      expect(mockPatientInvitesService.redeem).not.toHaveBeenCalled();
    });

    it('rejects with ForbiddenException and creates nothing when the invite is not valid', async () => {
      mockPatientInvitesService.checkStatus.mockResolvedValue({ valid: false });

      await expect(
        service.registerWithPhone('71234567', 'secret123', 'expired-token'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockSupabaseAdminService.createPhoneUser).not.toHaveBeenCalled();
    });

    it('propagates errors from SupabaseAdminService (e.g. duplicate phone)', async () => {
      mockPatientInvitesService.checkStatus.mockResolvedValue({ valid: true });
      mockSupabaseAdminService.createPhoneUser.mockRejectedValue(
        new Error('Ese teléfono ya está registrado'),
      );

      await expect(
        service.registerWithPhone('71234567', 'secret123', 'invite-token'),
      ).rejects.toThrow('Ese teléfono ya está registrado');
    });
  });

  describe('getCurrentUser', () => {
    it('should return the user when found', async () => {
      mockRepo.findByAuthUserId.mockResolvedValue(mockUser);

      const result = await service.getCurrentUser(AUTH_USER_ID);

      expect(result).toBe(mockUser);
      expect(mockRepo.findByAuthUserId).toHaveBeenCalledWith(AUTH_USER_ID);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockRepo.findByAuthUserId.mockResolvedValue(null);

      await expect(service.getCurrentUser('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should propagate repository errors', async () => {
      mockRepo.findByAuthUserId.mockRejectedValue(new Error('DB error'));

      await expect(service.getCurrentUser('uid')).rejects.toThrow('DB error');
    });
  });
});
