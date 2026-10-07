import {
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UserRepository } from '../domain/UserRepository';
import { User } from '../domain/User';
import { UserRole } from '../domain/value-objects/UserRole';
import { AuthenticatedUser } from '../domain/AuthenticatedUser';
import { PatientInvitesService } from '../../patient-invites/application/patient-invites.service';
import { SupabaseAdminService } from '../infrastructure/SupabaseAdminService';
import { EmailSender } from '../../patient-invites/domain/EmailSender';

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
  findByEmail: jest.fn(),
};

const mockPatientInvitesService = {
  redeem: jest.fn(),
  createInvite: jest.fn(),
  checkStatus: jest.fn(),
  registrationTarget: jest.fn(),
};

const mockSupabaseAdminService = {
  setConfirmedPhone: jest.fn(),
  createPhoneUser: jest.fn(),
  createEmailUser: jest.fn(),
  createEmailConfirmation: jest.fn(),
  createRecoveryLink: jest.fn(),
  deleteUser: jest.fn(),
};

const mockEmailSender = {
  sendInviteEmail: jest.fn(),
  sendAccountEmail: jest.fn(),
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
        { provide: EmailSender, useValue: mockEmailSender },
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

    // CLI-184: un paciente eliminado (o un doctor dado de baja) no entra.
    it('rechaza con 403 a una cuenta dada de baja y no la toca', async () => {
      mockRepo.findByAuthUserId.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      await expect(service.syncUser(authUser)).rejects.toThrow(
        'Tu cuenta fue dada de baja.',
      );
      expect(mockRepo.upsertByAuthUserId).not.toHaveBeenCalled();
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
      mockSupabaseAdminService.setConfirmedPhone.mockResolvedValue({
        ok: true,
      });

      const result = await service.syncUser(authUser, 'valid-invite-token');

      expect(result).toBe(linkedUserWithPhone);
      expect(mockSupabaseAdminService.setConfirmedPhone).toHaveBeenCalledWith(
        AUTH_USER_ID,
        '+59171234567',
      );
      // Habilitado: se limpia cualquier marca anterior.
      expect(mockRepo.updateContactInfo).toHaveBeenCalledWith('uuid-1', {
        phoneLoginError: null,
      });
    });

    it('if the phone is already on another Supabase account, the login still completes but the account is flagged (CLI-143)', async () => {
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
      mockSupabaseAdminService.setConfirmedPhone.mockResolvedValue({
        ok: false,
        reason: 'phone_in_use',
      });

      const result = await service.syncUser(authUser, 'valid-invite-token');

      expect(result).toBe(linkedUserWithPhone);
      expect(mockRepo.updateContactInfo).toHaveBeenCalledWith('uuid-1', {
        phoneLoginError: 'phone_in_use',
      });
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
      mockPatientInvitesService.registrationTarget.mockResolvedValue({
        valid: true,
        phone: null,
      });
      mockSupabaseAdminService.createPhoneUser.mockResolvedValue({
        authUserId: 'new-uid',
      });

      await service.registerWithPhone('71234567', 'secret123', 'invite-token');

      expect(mockPatientInvitesService.registrationTarget).toHaveBeenCalledWith(
        'invite-token',
      );
      expect(mockSupabaseAdminService.createPhoneUser).toHaveBeenCalledWith(
        '+59171234567',
        'secret123',
      );
    });

    it('does not redeem the invite (POST /auth/sync does it after login)', async () => {
      mockPatientInvitesService.registrationTarget.mockResolvedValue({
        valid: true,
        phone: null,
      });
      mockSupabaseAdminService.createPhoneUser.mockResolvedValue({
        authUserId: 'new-uid',
      });

      await service.registerWithPhone('71234567', 'secret123', 'invite-token');

      expect(mockPatientInvitesService.redeem).not.toHaveBeenCalled();
    });

    it('rejects with ForbiddenException and creates nothing when the invite is not valid', async () => {
      mockPatientInvitesService.registrationTarget.mockResolvedValue({
        valid: false,
        phone: null,
      });

      await expect(
        service.registerWithPhone('71234567', 'secret123', 'expired-token'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockSupabaseAdminService.createPhoneUser).not.toHaveBeenCalled();
    });

    // CLI-241: antes se le anteponía 591 a cualquier número extranjero.
    it('keeps the country code of a foreign phone and matches it against the ficha', async () => {
      mockPatientInvitesService.registrationTarget.mockResolvedValue({
        valid: true,
        phone: '+54 9 11 2345-6789',
      });
      mockSupabaseAdminService.createPhoneUser.mockResolvedValue({
        authUserId: 'new-uid',
      });

      await service.registerWithPhone('+5491123456789', 'secret123', 'tok');

      expect(mockSupabaseAdminService.createPhoneUser).toHaveBeenCalledWith(
        '+5491123456789',
        'secret123',
      );
    });

    // CLI-144: el teléfono de la ficha es el oficial.
    it('accepts the ficha phone even when stored in another format', async () => {
      mockPatientInvitesService.registrationTarget.mockResolvedValue({
        valid: true,
        phone: '71234567',
      });
      mockSupabaseAdminService.createPhoneUser.mockResolvedValue({
        authUserId: 'new-uid',
      });

      await service.registerWithPhone('+59171234567', 'secret123', 'tok');

      expect(mockSupabaseAdminService.createPhoneUser).toHaveBeenCalledWith(
        '+59171234567',
        'secret123',
      );
    });

    it('rejects a phone different from the ficha phone, saying which one to use, and creates nothing', async () => {
      mockPatientInvitesService.registrationTarget.mockResolvedValue({
        valid: true,
        phone: '+59177842665',
      });

      const attempt = service.registerWithPhone(
        '+59171234567',
        'secret123',
        'tok',
      );

      await expect(attempt).rejects.toThrow(UnprocessableEntityException);
      await expect(attempt).rejects.toThrow('terminado en 665');
      expect(mockSupabaseAdminService.createPhoneUser).not.toHaveBeenCalled();
    });

    it('propagates errors from SupabaseAdminService (e.g. duplicate phone)', async () => {
      mockPatientInvitesService.registrationTarget.mockResolvedValue({
        valid: true,
        phone: null,
      });
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

    it('rechaza con 403 a una cuenta dada de baja (CLI-184)', async () => {
      mockRepo.findByAuthUserId.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });

      await expect(service.getCurrentUser(AUTH_USER_ID)).rejects.toThrow(
        'Tu cuenta fue dada de baja.',
      );
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

  describe('registerWithEmail (CLI-242)', () => {
    const placeholder = new User(
      'user-ficha',
      null,
      null,
      UserRole.PATIENT,
      'Carla Mendoza',
      null,
      null,
      true,
      new Date(),
      new Date(),
    );
    const linkedUser = new User(
      'user-ficha',
      'new-uid',
      'carla@example.com',
      UserRole.PATIENT,
      'Carla Mendoza',
      null,
      null,
      true,
      new Date(),
      new Date(),
    );

    beforeEach(() => {
      process.env['FRONTEND_URL'] = 'https://app.example.com';
      mockPatientInvitesService.registrationTarget.mockResolvedValue({
        valid: true,
        phone: null,
      });
      mockSupabaseAdminService.createEmailUser.mockResolvedValue({
        authUserId: 'new-uid',
        hashedToken: 'hash-123',
      });
      mockRepo.findByAuthUserId.mockResolvedValue(null);
      mockPatientInvitesService.redeem.mockResolvedValue({
        userId: placeholder.id,
      });
      mockRepo.linkAuthIdentity.mockResolvedValue(linkedUser);
    });

    it('crea la cuenta, canjea la invitación y vincula la ficha en el mismo momento, y manda el correo', async () => {
      await service.registerWithEmail(
        'carla@example.com',
        'secret123',
        'invite-token',
      );

      expect(mockSupabaseAdminService.createEmailUser).toHaveBeenCalledWith(
        'carla@example.com',
        'secret123',
      );
      expect(mockPatientInvitesService.redeem).toHaveBeenCalledWith(
        'invite-token',
      );
      expect(mockRepo.linkAuthIdentity).toHaveBeenCalledWith('user-ficha', {
        authUserId: 'new-uid',
        email: 'carla@example.com',
        displayName: null,
        photoUrl: null,
      });
      expect(mockEmailSender.sendAccountEmail).toHaveBeenCalledWith({
        to: 'carla@example.com',
        displayName: 'Carla Mendoza',
        actionUrl:
          'https://app.example.com/auth/confirmar?token_hash=hash-123&type=signup',
        kind: 'confirm_email',
      });
    });

    it('con una invitación vencida da 403 y no crea nada', async () => {
      mockPatientInvitesService.registrationTarget.mockResolvedValue({
        valid: false,
        phone: null,
      });

      await expect(
        service.registerWithEmail('carla@example.com', 'secret123', 'tok'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockSupabaseAdminService.createEmailUser).not.toHaveBeenCalled();
      expect(mockEmailSender.sendAccountEmail).not.toHaveBeenCalled();
    });

    it('un segundo intento antes de confirmar no vuelve a canjear: solo reenvía el correo', async () => {
      mockRepo.findByAuthUserId.mockResolvedValue(linkedUser);

      await service.registerWithEmail(
        'carla@example.com',
        'secret123',
        'invite-token',
      );

      expect(mockPatientInvitesService.redeem).not.toHaveBeenCalled();
      expect(mockRepo.linkAuthIdentity).not.toHaveBeenCalled();
      expect(mockEmailSender.sendAccountEmail).toHaveBeenCalled();
    });

    it('si la invitación ya no se puede canjear, borra la cuenta recién creada y da 403', async () => {
      mockPatientInvitesService.redeem.mockResolvedValue(null);

      await expect(
        service.registerWithEmail('carla@example.com', 'secret123', 'tok'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockSupabaseAdminService.deleteUser).toHaveBeenCalledWith(
        'new-uid',
      );
      expect(mockEmailSender.sendAccountEmail).not.toHaveBeenCalled();
    });

    it('si el correo ya es de otra cuenta de la clínica (409 al vincular), borra la cuenta recién creada', async () => {
      mockRepo.linkAuthIdentity.mockRejectedValue(
        new ConflictException('El email ya está en uso'),
      );

      await expect(
        service.registerWithEmail('carla@example.com', 'secret123', 'tok'),
      ).rejects.toThrow(ConflictException);
      expect(mockSupabaseAdminService.deleteUser).toHaveBeenCalledWith(
        'new-uid',
      );
    });

    it('confirma el teléfono de la ficha como login, igual que al canjear en el sync', async () => {
      mockRepo.linkAuthIdentity.mockResolvedValue(
        new User(
          'user-ficha',
          'new-uid',
          'carla@example.com',
          UserRole.PATIENT,
          'Carla Mendoza',
          '70011122',
          null,
          true,
          new Date(),
          new Date(),
        ),
      );
      mockSupabaseAdminService.setConfirmedPhone.mockResolvedValue({
        ok: true,
      });

      await service.registerWithEmail(
        'carla@example.com',
        'secret123',
        'invite-token',
      );

      expect(mockSupabaseAdminService.setConfirmedPhone).toHaveBeenCalledWith(
        'new-uid',
        '+59170011122',
      );
    });
  });

  describe('resendEmailConfirmation (CLI-242)', () => {
    it('reenvía solo a una cuenta vinculada que todavía no confirmó', async () => {
      mockRepo.findByEmail.mockResolvedValue(mockUser);
      mockSupabaseAdminService.createEmailConfirmation.mockResolvedValue({
        email: 'test@example.com',
        hashedToken: 'hash-9',
      });

      await service.resendEmailConfirmation('test@example.com');

      expect(
        mockSupabaseAdminService.createEmailConfirmation,
      ).toHaveBeenCalledWith(AUTH_USER_ID);
      expect(mockEmailSender.sendAccountEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          kind: 'confirm_email',
          actionUrl: expect.stringContaining('token_hash=hash-9') as unknown,
        }),
      );
    });

    it('no hace nada si el correo no tiene cuenta o ya está confirmada', async () => {
      mockRepo.findByEmail.mockResolvedValueOnce(null);
      await service.resendEmailConfirmation('nadie@example.com');

      mockRepo.findByEmail.mockResolvedValueOnce(mockUser);
      mockSupabaseAdminService.createEmailConfirmation.mockResolvedValueOnce(
        null,
      );
      await service.resendEmailConfirmation('test@example.com');

      expect(mockEmailSender.sendAccountEmail).not.toHaveBeenCalled();
    });
  });

  describe('requestPasswordRecovery (CLI-243)', () => {
    beforeEach(() => {
      process.env['FRONTEND_URL'] = 'https://app.example.com';
    });

    it('manda el link de recuperación por correo con token_hash', async () => {
      mockSupabaseAdminService.createRecoveryLink.mockResolvedValue('hash-r');
      mockRepo.findByEmail.mockResolvedValue(mockUser);

      await service.requestPasswordRecovery('test@example.com');

      expect(mockEmailSender.sendAccountEmail).toHaveBeenCalledWith({
        to: 'test@example.com',
        displayName: 'Test User',
        actionUrl:
          'https://app.example.com/auth/reset-password?token_hash=hash-r&type=recovery',
        kind: 'reset_password',
      });
    });

    it('sin cuenta con ese correo no manda nada y no lanza', async () => {
      mockSupabaseAdminService.createRecoveryLink.mockResolvedValue(null);

      await expect(
        service.requestPasswordRecovery('nadie@example.com'),
      ).resolves.toBeUndefined();
      expect(mockEmailSender.sendAccountEmail).not.toHaveBeenCalled();
    });

    it('si falla Supabase o Resend, responde igual y lo deja en el log', async () => {
      mockSupabaseAdminService.createRecoveryLink.mockRejectedValue(
        new Error('caído'),
      );
      const logged = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      await expect(
        service.requestPasswordRecovery('test@example.com'),
      ).resolves.toBeUndefined();
      expect(logged).toHaveBeenCalled();
    });
  });
});
