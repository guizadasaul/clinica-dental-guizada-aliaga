import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';
import { AuthController } from './auth.controller';
import { PublicPhoneRegistrationController } from './public-phone-registration.controller';
import { PublicEmailRegistrationController } from './public-email-registration.controller';
import {
  RegisterEmailDto,
  ResendConfirmationDto,
} from './dto/register-email.dto';
import { AuthService } from '../../application/auth.service';
import type { AuthenticatedUser } from '../../domain/AuthenticatedUser';
import { SyncUserDto } from './dto/sync-user.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('controllers de auth', () => {
  const service = {
    syncUser: jest.fn(),
    getCurrentUser: jest.fn(),
    registerWithPhone: jest.fn(),
    registerWithEmail: jest.fn(),
    resendEmailConfirmation: jest.fn(),
  };
  const user = { uid: 'auth-1' } as AuthenticatedUser;

  beforeEach(() => jest.clearAllMocks());

  describe('AuthController', () => {
    const controller = new AuthController(service as unknown as AuthService);

    it('sync pasa el token de invitación si vino', async () => {
      service.syncUser.mockResolvedValue({ id: 'user-1' });

      await expect(
        controller.sync(user, { inviteToken: 'tok' }),
      ).resolves.toEqual({ id: 'user-1' });
      expect(service.syncUser).toHaveBeenCalledWith(user, 'tok');
    });

    it('sync sin cuerpo no rompe (login normal sin invitación)', async () => {
      await controller.sync(user, undefined as unknown as SyncUserDto);

      expect(service.syncUser).toHaveBeenCalledWith(user, undefined);
    });

    it('me devuelve el usuario de la app', async () => {
      service.getCurrentUser.mockResolvedValue({ id: 'user-1' });

      await expect(controller.me(user)).resolves.toEqual({ id: 'user-1' });
      expect(service.getCurrentUser).toHaveBeenCalledWith('auth-1');
    });
  });

  describe('PublicPhoneRegistrationController', () => {
    const controller = new PublicPhoneRegistrationController(
      service as unknown as AuthService,
    );
    const savedEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...savedEnv };
    });

    it('registra con teléfono y contraseña', async () => {
      service.registerWithPhone.mockResolvedValue(undefined);

      await controller.register({
        phone: '+59170000000',
        password: 'clave-123',
        inviteToken: 'token-1',
      });

      expect(service.registerWithPhone).toHaveBeenCalledWith(
        '+59170000000',
        'clave-123',
        'token-1',
      );
    });

    // CLI-36: 5 registros por hora por IP, configurable por env (se lee por
    // request, no al cargar la clase).
    it('limita a 5 por hora por default, configurable con THROTTLE_REGISTER_PHONE_PER_HOUR', () => {
      const limit = Reflect.getMetadata(
        `${THROTTLER_LIMIT}default`,
        Reflect.get(PublicPhoneRegistrationController.prototype, 'register'),
      ) as () => number;

      delete process.env['THROTTLE_REGISTER_PHONE_PER_HOUR'];
      expect(limit()).toBe(5);
      process.env['THROTTLE_REGISTER_PHONE_PER_HOUR'] = '20';
      expect(limit()).toBe(20);
    });
  });

  describe('PublicEmailRegistrationController (CLI-242)', () => {
    const controller = new PublicEmailRegistrationController(
      service as unknown as AuthService,
    );
    const savedEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...savedEnv };
    });

    it('registra con correo y contraseña', async () => {
      await controller.register({
        email: 'carla@example.com',
        password: 'clave-123',
        inviteToken: 'token-1',
      });

      expect(service.registerWithEmail).toHaveBeenCalledWith(
        'carla@example.com',
        'clave-123',
        'token-1',
      );
    });

    it('reenvía la confirmación', async () => {
      await controller.resend({ email: 'carla@example.com' });

      expect(service.resendEmailConfirmation).toHaveBeenCalledWith(
        'carla@example.com',
      );
    });

    it.each(['register', 'resend'])(
      '%s limita a 5 por hora por default, configurable con THROTTLE_REGISTER_EMAIL_PER_HOUR',
      (method) => {
        const limit = Reflect.getMetadata(
          `${THROTTLER_LIMIT}default`,
          Reflect.get(PublicEmailRegistrationController.prototype, method),
        ) as () => number;

        delete process.env['THROTTLE_REGISTER_EMAIL_PER_HOUR'];
        expect(limit()).toBe(5);
        process.env['THROTTLE_REGISTER_EMAIL_PER_HOUR'] = '20';
        expect(limit()).toBe(20);
      },
    );

    it('el DTO normaliza el correo y exige una contraseña de 8 a 72 caracteres', async () => {
      const dto = plainToInstance(RegisterEmailDto, {
        email: '  Carla@Example.COM ',
        password: 'corta',
        inviteToken: 'tok',
      });
      const errors = await validate(dto);

      expect(dto.email).toBe('carla@example.com');
      expect(errors.map((e) => e.property)).toEqual(['password']);
      await expect(
        validate(plainToInstance(ResendConfirmationDto, { email: 'no-es' })),
      ).resolves.toHaveLength(1);
    });
  });

  describe('SyncUserDto', () => {
    it('el token de invitación es opcional y acotado', async () => {
      await expect(validate(plainToInstance(SyncUserDto, {}))).resolves.toEqual(
        [],
      );
      const errors = await validate(
        plainToInstance(SyncUserDto, { inviteToken: 'x'.repeat(401) }),
      );
      expect(errors.map((e) => e.property)).toEqual(['inviteToken']);
    });
  });
});
