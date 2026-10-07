import { PrismaPasswordResetLinkRepository } from './prisma-password-reset-link.repository';
import { PrismaService } from '../../../shared/prisma/prisma.service';

const NOW = new Date('2026-10-07T12:00:00.000Z');
const LATER = new Date('2026-10-07T12:30:00.000Z');

describe('PrismaPasswordResetLinkRepository', () => {
  let prismaMock: {
    password_reset_links: {
      create: jest.Mock;
      updateMany: jest.Mock;
      findUnique: jest.Mock;
    };
    patients: { findFirst: jest.Mock };
    transaction: jest.Mock;
  };
  let repo: PrismaPasswordResetLinkRepository;

  beforeEach(() => {
    prismaMock = {
      password_reset_links: {
        create: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
      },
      patients: { findFirst: jest.fn() },
      transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prismaMock)),
    };
    repo = new PrismaPasswordResetLinkRepository(
      prismaMock as unknown as PrismaService,
    );
  });

  describe('findPatientAccount', () => {
    it('arma el nombre completo y trae la cuenta y el teléfono, sin fichas eliminadas', async () => {
      prismaMock.patients.findFirst.mockResolvedValue({
        user_id: 'user-1',
        first_name: 'Juana',
        last_name_paternal: 'Perez',
        last_name_maternal: null,
        users: { auth_user_id: 'auth-1', phone: '+59170011122' },
      });

      await expect(repo.findPatientAccount('patient-1')).resolves.toEqual({
        userId: 'user-1',
        authUserId: 'auth-1',
        fullName: 'Juana Perez',
        phone: '+59170011122',
      });
      expect(prismaMock.patients.findFirst).toHaveBeenCalledWith({
        where: { id: 'patient-1', deleted_at: null },
        include: { users: true },
      });
    });

    it('null si la ficha no existe', async () => {
      prismaMock.patients.findFirst.mockResolvedValue(null);

      await expect(repo.findPatientAccount('nope')).resolves.toBeNull();
    });
  });

  it('replaceForUser invalida los pendientes y crea el nuevo en una transacción', async () => {
    await repo.replaceForUser('user-1', 'hash-1', LATER, NOW);

    expect(prismaMock.transaction).toHaveBeenCalled();
    expect(prismaMock.password_reset_links.updateMany).toHaveBeenCalledWith({
      where: { user_id: 'user-1', used_at: null },
      data: { used_at: NOW },
    });
    expect(prismaMock.password_reset_links.create).toHaveBeenCalledWith({
      data: { user_id: 'user-1', token_hash: 'hash-1', expires_at: LATER },
    });
  });

  describe('findStatus', () => {
    it('vigente si no se usó y no venció', async () => {
      prismaMock.password_reset_links.findUnique.mockResolvedValue({
        used_at: null,
        expires_at: LATER,
        users: { phone: '+59170011122' },
      });

      await expect(repo.findStatus('hash-1', NOW)).resolves.toEqual({
        valid: true,
        phone: '+59170011122',
      });
    });

    it('no vigente si ya se usó o venció', async () => {
      prismaMock.password_reset_links.findUnique.mockResolvedValueOnce({
        used_at: NOW,
        expires_at: LATER,
        users: { phone: null },
      });
      prismaMock.password_reset_links.findUnique.mockResolvedValueOnce({
        used_at: null,
        expires_at: NOW,
        users: { phone: null },
      });

      await expect(repo.findStatus('hash-1', NOW)).resolves.toMatchObject({
        valid: false,
      });
      await expect(repo.findStatus('hash-1', NOW)).resolves.toMatchObject({
        valid: false,
      });
    });

    it('null si el token no existe', async () => {
      prismaMock.password_reset_links.findUnique.mockResolvedValue(null);

      await expect(repo.findStatus('nope', NOW)).resolves.toBeNull();
    });
  });

  describe('redeem', () => {
    it('marca el link como usado solo si sigue vigente y devuelve la cuenta', async () => {
      prismaMock.password_reset_links.updateMany.mockResolvedValue({
        count: 1,
      });
      prismaMock.password_reset_links.findUnique.mockResolvedValue({
        users: { auth_user_id: 'auth-1' },
      });

      await expect(repo.redeem('hash-1', NOW)).resolves.toEqual({
        authUserId: 'auth-1',
      });
      expect(prismaMock.password_reset_links.updateMany).toHaveBeenCalledWith({
        where: { token_hash: 'hash-1', used_at: null, expires_at: { gt: NOW } },
        data: { used_at: NOW },
      });
    });

    it('null si ya se usó o venció', async () => {
      prismaMock.password_reset_links.updateMany.mockResolvedValue({
        count: 0,
      });

      await expect(repo.redeem('hash-1', NOW)).resolves.toBeNull();
      expect(prismaMock.password_reset_links.findUnique).not.toHaveBeenCalled();
    });

    it('null si la ficha quedó sin cuenta', async () => {
      prismaMock.password_reset_links.updateMany.mockResolvedValue({
        count: 1,
      });
      prismaMock.password_reset_links.findUnique.mockResolvedValue({
        users: { auth_user_id: null },
      });

      await expect(repo.redeem('hash-1', NOW)).resolves.toBeNull();
    });
  });

  it('release vuelve a dejar el link sin usar', async () => {
    await repo.release('hash-1');

    expect(prismaMock.password_reset_links.updateMany).toHaveBeenCalledWith({
      where: { token_hash: 'hash-1' },
      data: { used_at: null },
    });
  });
});
