import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';
import { ROLES_KEY } from '../../../auth/infrastructure/roles.decorator';
import { UserRole } from '../../../auth/domain/value-objects/UserRole';
import type { PasswordResetService } from '../../application/password-reset.service';
import { PasswordResetLinksController } from './password-reset-links.controller';
import { PublicPasswordResetController } from './public-password-reset.controller';

describe('controllers de contraseña nueva (CLI-244)', () => {
  const service = {
    createLink: jest.fn(),
    checkStatus: jest.fn(),
    resetPassword: jest.fn(),
  };
  const asService = service as unknown as PasswordResetService;

  beforeEach(() => jest.clearAllMocks());

  it('POST /patients/:id/password-reset-links es solo para odontólogos y delega al service', async () => {
    service.createLink.mockResolvedValue({ whatsappUrl: 'https://wa.me/1' });
    const controller = new PasswordResetLinksController(asService);

    await expect(controller.create('patient-1')).resolves.toEqual({
      whatsappUrl: 'https://wa.me/1',
    });
    expect(service.createLink).toHaveBeenCalledWith('patient-1');
    expect(
      Reflect.getMetadata(
        ROLES_KEY,
        Reflect.get(PasswordResetLinksController.prototype, 'create'),
      ),
    ).toEqual([UserRole.ODONTOLOGIST]);
  });

  it('el status y el cambio público delegan al service', async () => {
    service.checkStatus.mockResolvedValue({ valid: true });
    const controller = new PublicPasswordResetController(asService);

    await expect(controller.status('tok')).resolves.toEqual({ valid: true });
    await controller.reset('tok', { password: 'una-clave-nueva' });

    expect(service.checkStatus).toHaveBeenCalledWith('tok');
    expect(service.resetPassword).toHaveBeenCalledWith(
      'tok',
      'una-clave-nueva',
    );
  });

  it('el cambio limita a 10 por hora por default, configurable con THROTTLE_PASSWORD_RESET_PER_HOUR', () => {
    const limit = Reflect.getMetadata(
      `${THROTTLER_LIMIT}default`,
      Reflect.get(PublicPasswordResetController.prototype, 'reset'),
    ) as () => number;

    delete process.env['THROTTLE_PASSWORD_RESET_PER_HOUR'];
    expect(limit()).toBe(10);
    process.env['THROTTLE_PASSWORD_RESET_PER_HOUR'] = '3';
    expect(limit()).toBe(3);
    delete process.env['THROTTLE_PASSWORD_RESET_PER_HOUR'];
  });
});
