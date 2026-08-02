import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UserRepository } from '../domain/UserRepository';
import { TokenPort } from '../domain/TokenPort';
import { User } from '../domain/User';
import { UserRole } from '../domain/value-objects/UserRole';
import { AuthenticatedUser } from '../domain/AuthenticatedUser';

const mockUser = new User(
  'uuid-1',
  'firebase-uid-1',
  'test@example.com',
  UserRole.PATIENT,
  'Test User',
  null,
  null,
  null,
  true,
  new Date(),
  new Date(),
);

const mockRepo = {
  upsertByFirebaseUid: jest.fn(),
  findByFirebaseUid: jest.fn(),
  findByPhone: jest.fn(),
  createPhoneUser: jest.fn(),
};

const mockTokenPort = {
  createFirebaseUser: jest.fn(),
  createCustomToken: jest.fn(),
};

const firebaseUser: AuthenticatedUser = {
  uid: 'firebase-uid-1',
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
        { provide: TokenPort, useValue: mockTokenPort },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  describe('syncUser', () => {
    it('should upsert and return the user', async () => {
      mockRepo.upsertByFirebaseUid.mockResolvedValue(mockUser);

      const result = await service.syncUser(firebaseUser);

      expect(result).toBe(mockUser);
      expect(mockRepo.upsertByFirebaseUid).toHaveBeenCalledWith({
        firebaseUid: 'firebase-uid-1',
        email: 'test@example.com',
        displayName: 'Test User',
        photoUrl: null,
        phone: undefined,
      });
    });

    it('should pass phone when provided', async () => {
      mockRepo.upsertByFirebaseUid.mockResolvedValue(mockUser);

      await service.syncUser(firebaseUser, '+59171234567');

      expect(mockRepo.upsertByFirebaseUid).toHaveBeenCalledWith(
        expect.objectContaining({ phone: '+59171234567' }),
      );
    });

    it('should propagate repository errors', async () => {
      mockRepo.upsertByFirebaseUid.mockRejectedValue(new Error('DB error'));

      await expect(service.syncUser(firebaseUser)).rejects.toThrow('DB error');
    });
  });

  describe('getCurrentUser', () => {
    it('should return the user when found', async () => {
      mockRepo.findByFirebaseUid.mockResolvedValue(mockUser);

      const result = await service.getCurrentUser('firebase-uid-1');

      expect(result).toBe(mockUser);
      expect(mockRepo.findByFirebaseUid).toHaveBeenCalledWith('firebase-uid-1');
    });

    it('should throw NotFoundException when user does not exist', async () => {
      mockRepo.findByFirebaseUid.mockResolvedValue(null);

      await expect(service.getCurrentUser('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should propagate repository errors', async () => {
      mockRepo.findByFirebaseUid.mockRejectedValue(new Error('DB error'));

      await expect(service.getCurrentUser('uid')).rejects.toThrow('DB error');
    });
  });

  describe('registerWithPhone', () => {
    it('should throw ConflictException if phone already exists', async () => {
      mockRepo.findByPhone.mockResolvedValue(mockUser);

      await expect(service.registerWithPhone('Name', '123', 'pass1234')).rejects.toThrow(ConflictException);
    });

    it('should create user and return custom token', async () => {
      mockRepo.findByPhone.mockResolvedValue(null);
      mockTokenPort.createFirebaseUser.mockResolvedValue('new-uid');
      mockRepo.createPhoneUser.mockResolvedValue(mockUser);
      mockTokenPort.createCustomToken.mockResolvedValue('custom-token');

      const token = await service.registerWithPhone('Test User', '123456', 'password1');

      expect(token).toBe('custom-token');
      expect(mockTokenPort.createFirebaseUser).toHaveBeenCalledWith('Test User');
      expect(mockRepo.createPhoneUser).toHaveBeenCalledWith(
        expect.objectContaining({ firebaseUid: 'new-uid', displayName: 'Test User', phone: '123456' }),
      );
    });
  });

  describe('loginWithPhone', () => {
    it('should throw UnauthorizedException if phone not found', async () => {
      mockRepo.findByPhone.mockResolvedValue(null);

      await expect(service.loginWithPhone('123', 'pass')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password does not match', async () => {
      const userWithHash = new User('uuid-1', 'uid', null, UserRole.PATIENT, 'Name', '123', null, '$2b$10$invalidhash', true, new Date(), new Date());
      mockRepo.findByPhone.mockResolvedValue(userWithHash);

      await expect(service.loginWithPhone('123', 'wrongpassword')).rejects.toThrow(UnauthorizedException);
    });
  });
});
