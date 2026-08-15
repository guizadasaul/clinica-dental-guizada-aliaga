import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaUserRepository } from './prisma-user.repository';
import { PrismaService } from '../../../shared/prisma/prisma.service';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const USER_ID = 'user-1';
const AUTH_USER_ID = '11111111-1111-4111-8111-111111111111';

function fakeUserRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    auth_user_id: null,
    email: null,
    display_name: 'Guest Name',
    photo_url: null,
    phone: '70000000',
    is_active: true,
    role: 'patient',
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

describe('PrismaUserRepository', () => {
  let prismaMock: {
    users: {
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      upsert: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let repo: PrismaUserRepository;

  beforeEach(() => {
    prismaMock = {
      users: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    repo = new PrismaUserRepository(prismaMock as unknown as PrismaService);
  });

  describe('upsertByAuthUserId', () => {
    it('returns the upserted record on the happy path', async () => {
      prismaMock.users.upsert.mockResolvedValue(
        fakeUserRecord({ auth_user_id: AUTH_USER_ID, email: 'a@b.com' }),
      );

      const result = await repo.upsertByAuthUserId({
        authUserId: AUTH_USER_ID,
        email: 'a@b.com',
        displayName: 'Real Name',
        photoUrl: null,
      });

      expect(result.authUserId).toBe(AUTH_USER_ID);
      expect(prismaMock.users.update).not.toHaveBeenCalled();
    });

    it('re-links an existing row by email instead of throwing when the email is already taken by a different auth_user_id', async () => {
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: 'test' },
      );
      prismaMock.users.upsert.mockRejectedValue(error);
      prismaMock.users.update.mockResolvedValue(
        fakeUserRecord({
          auth_user_id: AUTH_USER_ID,
          email: 'taken@b.com',
          role: 'odontologist',
        }),
      );

      const result = await repo.upsertByAuthUserId({
        authUserId: AUTH_USER_ID,
        email: 'taken@b.com',
        displayName: 'Real Name',
        photoUrl: null,
      });

      expect(prismaMock.users.update).toHaveBeenCalledWith({
        where: { email: 'taken@b.com' },
        data: expect.objectContaining({
          auth_user_id: AUTH_USER_ID,
        }) as Record<string, unknown>,
      });
      // El rol existente (ej. odontologist) no se toca — solo se re-vincula
      // el auth_user_id, igual que hace linkAuthIdentity.
      expect(result.role).toBe('odontologist');
      expect(result.authUserId).toBe(AUTH_USER_ID);
    });

    it('rethrows non-P2002 errors', async () => {
      prismaMock.users.upsert.mockRejectedValue(new Error('boom'));

      await expect(
        repo.upsertByAuthUserId({
          authUserId: AUTH_USER_ID,
          email: 'a@b.com',
          displayName: null,
          photoUrl: null,
        }),
      ).rejects.toThrow('boom');
      expect(prismaMock.users.update).not.toHaveBeenCalled();
    });

    it('does not overwrite an existing email with null (e.g. a phone-only login re-syncing)', async () => {
      prismaMock.users.upsert.mockResolvedValue(
        fakeUserRecord({ auth_user_id: AUTH_USER_ID, email: 'existing@b.com' }),
      );

      await repo.upsertByAuthUserId({
        authUserId: AUTH_USER_ID,
        email: null,
        phone: '71234567',
        displayName: 'Real Name',
        photoUrl: null,
      });

      const upsertArgs = prismaMock.users.upsert.mock.calls[0][0] as {
        update: Record<string, unknown>;
      };
      expect(upsertArgs.update).not.toHaveProperty('email');
      expect(upsertArgs.update['phone']).toBe('71234567');
    });
  });

  describe('createPlaceholder', () => {
    it('creates a user with auth_user_id null and role patient', async () => {
      prismaMock.users.create.mockResolvedValue(fakeUserRecord());

      const result = await repo.createPlaceholder({
        displayName: 'Guest Name',
        phone: '70000000',
        email: null,
      });

      expect(prismaMock.users.create).toHaveBeenCalledWith({
        data: {
          auth_user_id: null,
          email: null,
          display_name: 'Guest Name',
          phone: '70000000',
          role: 'patient',
        },
      });
      expect(result.authUserId).toBeNull();
    });
  });

  describe('linkAuthIdentity', () => {
    it('performs a single conditional UPDATE (WHERE id AND auth_user_id IS NULL)', async () => {
      prismaMock.users.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.users.findUnique.mockResolvedValue(
        fakeUserRecord({ auth_user_id: AUTH_USER_ID, email: 'a@b.com' }),
      );

      const result = await repo.linkAuthIdentity(USER_ID, {
        authUserId: AUTH_USER_ID,
        email: 'a@b.com',
        displayName: 'Real Name',
        photoUrl: null,
      });

      expect(prismaMock.users.updateMany).toHaveBeenCalledWith({
        where: { id: USER_ID, auth_user_id: null },
        data: expect.objectContaining({
          auth_user_id: AUTH_USER_ID,
          email: 'a@b.com',
        }) as Record<string, unknown>,
      });
      expect(result?.authUserId).toBe(AUTH_USER_ID);
    });

    it('is idempotent: returns null and never reads the row when it was already linked', async () => {
      prismaMock.users.updateMany.mockResolvedValue({ count: 0 });

      const result = await repo.linkAuthIdentity(USER_ID, {
        authUserId: AUTH_USER_ID,
        email: 'a@b.com',
        displayName: 'Real Name',
        photoUrl: null,
      });

      expect(result).toBeNull();
      expect(prismaMock.users.findUnique).not.toHaveBeenCalled();
    });

    it('translates a unique-email conflict into ConflictException', async () => {
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: 'test',
        },
      );
      prismaMock.users.updateMany.mockRejectedValue(error);

      await expect(
        repo.linkAuthIdentity(USER_ID, {
          authUserId: AUTH_USER_ID,
          email: 'taken@b.com',
          displayName: null,
          photoUrl: null,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('does not overwrite the invited patient\'s existing email when linking a phone-only login (null email)', async () => {
      prismaMock.users.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.users.findUnique.mockResolvedValue(
        fakeUserRecord({
          auth_user_id: AUTH_USER_ID,
          email: 'ya-cargado-por-el-doctor@b.com',
          phone: '59171234567',
        }),
      );

      await repo.linkAuthIdentity(USER_ID, {
        authUserId: AUTH_USER_ID,
        email: null,
        phone: '59171234567',
        displayName: 'Real Name',
        photoUrl: null,
      });

      const updateManyArgs = prismaMock.users.updateMany.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(updateManyArgs.data).not.toHaveProperty('email');
      expect(updateManyArgs.data['phone']).toBe('59171234567');
    });
  });
});
