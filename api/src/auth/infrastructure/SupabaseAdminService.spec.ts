import {
  ConflictException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { SupabaseAdminService } from './SupabaseAdminService';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

describe('SupabaseAdminService', () => {
  const savedEnv = { ...process.env };
  const admin = { updateUserById: jest.fn(), createUser: jest.fn() };
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    (createClient as jest.Mock).mockReturnValue({ auth: { admin } });
    process.env['SUPABASE_URL'] = 'https://proyecto.supabase.co';
    process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'service-role';
  });

  afterAll(() => {
    process.env = { ...savedEnv };
  });

  it('crea el cliente admin sin sesión persistente', () => {
    new SupabaseAdminService();

    expect(createClient).toHaveBeenCalledWith(
      'https://proyecto.supabase.co',
      'service-role',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  });

  describe('sin service role key configurada', () => {
    beforeEach(() => {
      delete process.env['SUPABASE_SERVICE_ROLE_KEY'];
    });

    it('setConfirmedPhone no hace nada (solo avisa)', async () => {
      const service = new SupabaseAdminService();

      await expect(
        service.setConfirmedPhone('auth-1', '+59170000000'),
      ).resolves.toBeUndefined();
      expect(createClient).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
    });

    it('createPhoneUser responde 503', async () => {
      await expect(
        new SupabaseAdminService().createPhoneUser('+59170000000', 'clave'),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('setConfirmedPhone', () => {
    it('confirma el teléfono sin mandar SMS', async () => {
      admin.updateUserById.mockResolvedValue({ error: null });

      await new SupabaseAdminService().setConfirmedPhone(
        'auth-1',
        '+59170000000',
      );

      expect(admin.updateUserById).toHaveBeenCalledWith('auth-1', {
        phone: '+59170000000',
        phone_confirm: true,
      });
      expect(error).not.toHaveBeenCalled();
    });

    it('si Supabase falla, lo registra pero no corta el flujo', async () => {
      admin.updateUserById.mockResolvedValue({ error: { message: 'boom' } });

      await expect(
        new SupabaseAdminService().setConfirmedPhone('auth-1', '+59170000000'),
      ).resolves.toBeUndefined();
      expect(error).toHaveBeenCalled();
    });
  });

  describe('createPhoneUser', () => {
    it('crea la cuenta con el teléfono ya confirmado', async () => {
      admin.createUser.mockResolvedValue({
        data: { user: { id: 'auth-nuevo' } },
        error: null,
      });

      await expect(
        new SupabaseAdminService().createPhoneUser('+59170000000', 'clave'),
      ).resolves.toEqual({ authUserId: 'auth-nuevo' });
      expect(admin.createUser).toHaveBeenCalledWith({
        phone: '+59170000000',
        password: 'clave',
        phone_confirm: true,
      });
    });

    it('teléfono ya registrado → 409', async () => {
      admin.createUser.mockResolvedValue({
        data: { user: null },
        error: { code: 'phone_exists' },
      });

      await expect(
        new SupabaseAdminService().createPhoneUser('+59170000000', 'clave'),
      ).rejects.toThrow(ConflictException);
    });

    it('cualquier otro error → 503', async () => {
      admin.createUser.mockResolvedValue({
        data: { user: null },
        error: { code: 'unexpected_failure' },
      });

      await expect(
        new SupabaseAdminService().createPhoneUser('+59170000000', 'clave'),
      ).rejects.toThrow('No se pudo crear la cuenta');
      expect(error).toHaveBeenCalled();
    });
  });
});
