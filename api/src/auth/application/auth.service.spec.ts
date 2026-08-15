import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UserRepository } from '../domain/UserRepository';
import { User } from '../domain/User';
import { UserRole } from '../domain/value-objects/UserRole';
import { AuthenticatedUser } from '../domain/AuthenticatedUser';
import { PatientInvitesService } from '../../patient-invites/application/patient-invites.service';

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

const authUser: AuthenticatedUser = {
  uid: AUTH_USER_ID,
  email: 'test@example.com',
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
