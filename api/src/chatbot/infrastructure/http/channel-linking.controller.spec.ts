import { GUARDS_METADATA } from '@nestjs/common/constants';
import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';
import { User } from '../../../auth/domain/User';
import { UserRole } from '../../../auth/domain/value-objects/UserRole';
import { ROLES_KEY } from '../../../auth/infrastructure/roles.decorator';
import { RolesGuard } from '../../../auth/infrastructure/RolesGuard';
import { SupabaseAuthGuard } from '../../../auth/infrastructure/SupabaseAuthGuard';
import type { ChannelLinkingService } from '../../application/channel-linking.service';
import { ChannelLinkingController } from './channel-linking.controller';

const NOW = new Date('2026-09-26T12:00:00Z');
const appUser = new User(
  'user-1',
  'auth-1',
  'a@b.com',
  UserRole.PATIENT,
  'Ana',
  null,
  null,
  true,
  NOW,
  NOW,
);

describe('ChannelLinkingController (CLI-100)', () => {
  const linking = {
    requestCode: jest.fn(),
    listLinks: jest.fn(),
    unlink: jest.fn(),
  };
  const controller = new ChannelLinkingController(
    linking as unknown as ChannelLinkingService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('pide sesión y cualquiera de los tres roles', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ChannelLinkingController),
    ).toEqual([SupabaseAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, ChannelLinkingController)).toEqual([
      UserRole.PATIENT,
      UserRole.ODONTOLOGIST,
      UserRole.ADMIN,
    ]);
  });

  it('pide el código de WhatsApp para el usuario autenticado, con rate limit por hora', async () => {
    const issued = { code: '123456' };
    linking.requestCode.mockResolvedValue(issued);

    await expect(controller.requestWhatsappCode(appUser)).resolves.toBe(issued);
    expect(linking.requestCode).toHaveBeenCalledWith('user-1', 'whatsapp');

    const limit = Reflect.getMetadata(
      `${THROTTLER_LIMIT}default`,
      Reflect.get(controller, 'requestWhatsappCode'),
    ) as () => number;
    expect(limit()).toBe(10);
  });

  it('lista y desvincula solo lo del usuario autenticado', async () => {
    linking.listLinks.mockResolvedValue([]);

    await controller.list(appUser);
    await controller.unlink(appUser, 'link-1');

    expect(linking.listLinks).toHaveBeenCalledWith('user-1');
    expect(linking.unlink).toHaveBeenCalledWith('user-1', 'link-1');
  });
});
