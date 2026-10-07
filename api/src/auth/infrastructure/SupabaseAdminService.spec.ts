import {
  BadRequestException,
  ConflictException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { SupabaseAdminService } from './SupabaseAdminService';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

describe('SupabaseAdminService', () => {
  const savedEnv = { ...process.env };
  const admin = {
    updateUserById: jest.fn(),
    createUser: jest.fn(),
    generateLink: jest.fn(),
    getUserById: jest.fn(),
    deleteUser: jest.fn(),
  };
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
      ).resolves.toEqual({ ok: true });
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

      await expect(
        new SupabaseAdminService().setConfirmedPhone('auth-1', '+59170000000'),
      ).resolves.toEqual({ ok: true });

      expect(admin.updateUserById).toHaveBeenCalledWith('auth-1', {
        phone: '+59170000000',
        phone_confirm: true,
      });
      expect(error).not.toHaveBeenCalled();
    });

    it('si Supabase falla por otro motivo, lo registra y devuelve "unknown" sin lanzar', async () => {
      admin.updateUserById.mockResolvedValue({
        error: { message: 'boom', status: 502 },
      });

      await expect(
        new SupabaseAdminService().setConfirmedPhone('auth-1', '+59170000000'),
      ).resolves.toEqual({ ok: false, reason: 'unknown' });
      expect(error).toHaveBeenCalled();
    });

    // CLI-143: updateUserById con un teléfono de otra cuenta responde este
    // 500 genérico, sin código (verificado contra Supabase real).
    it('el 500 "Error updating user" de un teléfono repetido es "phone_in_use"', async () => {
      admin.updateUserById.mockResolvedValue({
        error: { message: 'Error updating user', status: 500 },
      });

      await expect(
        new SupabaseAdminService().setConfirmedPhone('auth-1', '+59170000000'),
      ).resolves.toEqual({ ok: false, reason: 'phone_in_use' });
    });

    it('el código phone_exists también es "phone_in_use"', async () => {
      admin.updateUserById.mockResolvedValue({
        error: { message: 'Phone exists', status: 422, code: 'phone_exists' },
      });

      await expect(
        new SupabaseAdminService().setConfirmedPhone('auth-1', '+59170000000'),
      ).resolves.toEqual({ ok: false, reason: 'phone_in_use' });
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

  describe('createEmailUser (CLI-242)', () => {
    it('crea la cuenta sin confirmar con generateLink (Supabase no manda su correo) y devuelve el token', async () => {
      admin.generateLink.mockResolvedValue({
        data: { user: { id: 'uid-1' }, properties: { hashed_token: 'hash-1' } },
        error: null,
      });

      await expect(
        new SupabaseAdminService().createEmailUser('a@b.com', 'secret123'),
      ).resolves.toEqual({ authUserId: 'uid-1', hashedToken: 'hash-1' });
      expect(admin.generateLink).toHaveBeenCalledWith({
        type: 'signup',
        email: 'a@b.com',
        password: 'secret123',
      });
    });

    it('un correo ya confirmado da 409 con un mensaje que dice qué hacer', async () => {
      admin.generateLink.mockResolvedValue({
        data: null,
        error: { code: 'email_exists', status: 422 },
      });

      await expect(
        new SupabaseAdminService().createEmailUser('a@b.com', 'secret123'),
      ).rejects.toThrow(ConflictException);
    });

    it('otro error de Supabase da 503 y queda en el log', async () => {
      admin.generateLink.mockResolvedValue({
        data: null,
        error: { code: 'unexpected_failure', status: 500 },
      });

      await expect(
        new SupabaseAdminService().createEmailUser('a@b.com', 'secret123'),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(error).toHaveBeenCalled();
    });
  });

  describe('createEmailConfirmation (CLI-242)', () => {
    it('genera un token nuevo para una cuenta sin confirmar, sin contraseña', async () => {
      admin.getUserById.mockResolvedValue({
        data: { user: { email: 'a@b.com', email_confirmed_at: null } },
        error: null,
      });
      admin.generateLink.mockResolvedValue({
        data: { properties: { hashed_token: 'hash-2' } },
        error: null,
      });

      await expect(
        new SupabaseAdminService().createEmailConfirmation('uid-1'),
      ).resolves.toEqual({ email: 'a@b.com', hashedToken: 'hash-2' });
      expect(admin.generateLink).toHaveBeenCalledWith({
        type: 'signup',
        email: 'a@b.com',
      });
    });

    it('no hace nada si la cuenta ya está confirmada o no existe', async () => {
      admin.getUserById.mockResolvedValueOnce({
        data: { user: { email: 'a@b.com', email_confirmed_at: '2026-10-07' } },
        error: null,
      });
      admin.getUserById.mockResolvedValueOnce({
        data: { user: null },
        error: { status: 404 },
      });
      const service = new SupabaseAdminService();

      await expect(
        service.createEmailConfirmation('uid-1'),
      ).resolves.toBeNull();
      await expect(
        service.createEmailConfirmation('uid-2'),
      ).resolves.toBeNull();
      expect(admin.generateLink).not.toHaveBeenCalled();
    });
  });

  describe('deleteUser (CLI-242)', () => {
    it('borra la cuenta y nunca lanza aunque Supabase falle', async () => {
      admin.deleteUser.mockResolvedValue({ error: { status: 500 } });

      await expect(
        new SupabaseAdminService().deleteUser('uid-1'),
      ).resolves.toBeUndefined();
      expect(admin.deleteUser).toHaveBeenCalledWith('uid-1');
      expect(error).toHaveBeenCalled();
    });
  });

  describe('createRecoveryLink (CLI-243)', () => {
    it('genera el token de recuperación sin que Supabase mande su correo', async () => {
      admin.generateLink.mockResolvedValue({
        data: { properties: { hashed_token: 'hash-r' } },
        error: null,
      });

      await expect(
        new SupabaseAdminService().createRecoveryLink('a@b.com'),
      ).resolves.toBe('hash-r');
      expect(admin.generateLink).toHaveBeenCalledWith({
        type: 'recovery',
        email: 'a@b.com',
      });
    });

    it('sin cuenta con ese correo devuelve null (verificado: 404 user_not_found)', async () => {
      admin.generateLink.mockResolvedValue({
        data: null,
        error: { code: 'user_not_found', status: 404 },
      });

      await expect(
        new SupabaseAdminService().createRecoveryLink('a@b.com'),
      ).resolves.toBeNull();
    });

    it('otro error da 503', async () => {
      admin.generateLink.mockResolvedValue({
        data: null,
        error: { code: 'unexpected_failure', status: 500 },
      });

      await expect(
        new SupabaseAdminService().createRecoveryLink('a@b.com'),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('setPassword (CLI-244)', () => {
    it('cambia la contraseña de la cuenta por id', async () => {
      admin.updateUserById.mockResolvedValue({ error: null });

      await new SupabaseAdminService().setPassword('auth-1', 'una-clave-nueva');

      expect(admin.updateUserById).toHaveBeenCalledWith('auth-1', {
        password: 'una-clave-nueva',
      });
    });

    it('una contraseña débil da 400 con un mensaje para el paciente', async () => {
      admin.updateUserById.mockResolvedValue({
        error: { code: 'weak_password', status: 422 },
      });

      await expect(
        new SupabaseAdminService().setPassword('auth-1', '12345678'),
      ).rejects.toThrow(BadRequestException);
    });

    it('otro error da 503 y queda en el log', async () => {
      admin.updateUserById.mockResolvedValue({
        error: { code: 'unexpected_failure', status: 500 },
      });

      await expect(
        new SupabaseAdminService().setPassword('auth-1', 'una-clave-nueva'),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(error).toHaveBeenCalled();
    });

    it('sin service role key responde 503', async () => {
      delete process.env['SUPABASE_SERVICE_ROLE_KEY'];

      await expect(
        new SupabaseAdminService().setPassword('auth-1', 'una-clave-nueva'),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
