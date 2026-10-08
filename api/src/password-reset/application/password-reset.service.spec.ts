import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SupabaseAdminService } from '../../auth/infrastructure/SupabaseAdminService';
import { PasswordResetLinkRepository } from '../domain/PasswordResetLinkRepository';
import { PasswordResetService } from './password-reset.service';

const repo = {
  findPatientAccount: jest.fn(),
  replaceForUser: jest.fn(),
  findStatus: jest.fn(),
  redeem: jest.fn(),
  release: jest.fn(),
};
const admin = { setPassword: jest.fn() };

const ACCOUNT = {
  userId: 'user-1',
  authUserId: 'auth-1',
  fullName: 'Juana Perez',
  phone: '+59170011122',
};

const sha256 = (raw: string) => createHash('sha256').update(raw).digest('hex');

describe('PasswordResetService', () => {
  const savedFrontendUrl = process.env['FRONTEND_URL'];
  let service: PasswordResetService;

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env['FRONTEND_URL'] = 'https://app.example.com/';
    const module = await Test.createTestingModule({
      providers: [
        PasswordResetService,
        { provide: PasswordResetLinkRepository, useValue: repo },
        { provide: SupabaseAdminService, useValue: admin },
      ],
    }).compile();
    service = module.get(PasswordResetService);
  });

  afterAll(() => {
    process.env['FRONTEND_URL'] = savedFrontendUrl;
  });

  describe('createLink', () => {
    it('guarda solo el hash, vence a las 24 horas y devuelve el WhatsApp con el link', async () => {
      repo.findPatientAccount.mockResolvedValue(ACCOUNT);
      const before = Date.now();

      const { whatsappUrl } = await service.createLink('patient-1');

      const [userId, tokenHash, expiresAt] = repo.replaceForUser.mock
        .calls[0] as [string, string, Date, Date];
      expect(userId).toBe('user-1');
      const text = decodeURIComponent(whatsappUrl.split('?text=')[1]);
      const rawToken = /\/recuperar\/(\S+)/.exec(text)?.[1] ?? '';
      expect(whatsappUrl).toMatch(/^https:\/\/wa\.me\/59170011122\?text=/);
      expect(text).toContain('https://app.example.com/recuperar/');
      expect(text).toContain('*Juana Perez*');
      expect(text).toContain('vence en 24 horas');
      expect(tokenHash).toBe(sha256(rawToken));
      expect(tokenHash).not.toBe(rawToken);
      expect(expiresAt.getTime() - before).toBeGreaterThanOrEqual(
        24 * 60 * 60_000 - 1000,
      );
      expect(expiresAt.getTime() - before).toBeLessThanOrEqual(
        24 * 60 * 60_000 + 1000,
      );
    });

    it('cada link es distinto', async () => {
      repo.findPatientAccount.mockResolvedValue(ACCOUNT);

      const first = await service.createLink('patient-1');
      const second = await service.createLink('patient-1');

      expect(first.whatsappUrl).not.toBe(second.whatsappUrl);
    });

    it('404 si la ficha no existe', async () => {
      repo.findPatientAccount.mockResolvedValue(null);

      await expect(service.createLink('nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('409 si el paciente todavía no tiene cuenta', async () => {
      repo.findPatientAccount.mockResolvedValue({
        ...ACCOUNT,
        authUserId: null,
      });

      await expect(service.createLink('patient-1')).rejects.toThrow(
        ConflictException,
      );
      expect(repo.replaceForUser).not.toHaveBeenCalled();
    });

    it('409 si la ficha no tiene teléfono', async () => {
      repo.findPatientAccount.mockResolvedValue({ ...ACCOUNT, phone: null });

      await expect(service.createLink('patient-1')).rejects.toThrow(
        ConflictException,
      );
      expect(repo.replaceForUser).not.toHaveBeenCalled();
    });
  });

  describe('checkStatus', () => {
    it('vigente: valid con los últimos 3 dígitos del teléfono', async () => {
      repo.findStatus.mockResolvedValue({ valid: true, phone: '+59170011122' });

      await expect(service.checkStatus('raw')).resolves.toEqual({
        valid: true,
        phoneHint: '122',
      });
      expect(repo.findStatus).toHaveBeenCalledWith(
        sha256('raw'),
        expect.any(Date),
      );
    });

    it('vigente sin teléfono: sin pista', async () => {
      repo.findStatus.mockResolvedValue({ valid: true, phone: null });

      await expect(service.checkStatus('raw')).resolves.toEqual({
        valid: true,
      });
    });

    it('vencido o inexistente: solo valid false, sin pista', async () => {
      repo.findStatus.mockResolvedValueOnce({
        valid: false,
        phone: '+59170011122',
      });
      repo.findStatus.mockResolvedValueOnce(null);

      await expect(service.checkStatus('raw')).resolves.toEqual({
        valid: false,
      });
      await expect(service.checkStatus('raw')).resolves.toEqual({
        valid: false,
      });
    });
  });

  describe('resetPassword', () => {
    it('canjea el link y cambia la contraseña de esa cuenta', async () => {
      repo.redeem.mockResolvedValue({ authUserId: 'auth-1' });

      await service.resetPassword('raw', 'una-clave-nueva');

      expect(repo.redeem).toHaveBeenCalledWith(sha256('raw'), expect.any(Date));
      expect(admin.setPassword).toHaveBeenCalledWith(
        'auth-1',
        'una-clave-nueva',
      );
      expect(repo.release).not.toHaveBeenCalled();
    });

    it('403 si el link venció o ya se usó, sin tocar la contraseña', async () => {
      repo.redeem.mockResolvedValue(null);

      await expect(
        service.resetPassword('raw', 'una-clave-nueva'),
      ).rejects.toThrow(ForbiddenException);
      expect(admin.setPassword).not.toHaveBeenCalled();
    });

    it('si Supabase rechaza la contraseña, el link vuelve a servir', async () => {
      repo.redeem.mockResolvedValue({ authUserId: 'auth-1' });
      admin.setPassword.mockRejectedValue(new BadRequestException('débil'));

      await expect(service.resetPassword('raw', '12345678')).rejects.toThrow(
        BadRequestException,
      );
      expect(repo.release).toHaveBeenCalledWith(sha256('raw'));
    });
  });
});
