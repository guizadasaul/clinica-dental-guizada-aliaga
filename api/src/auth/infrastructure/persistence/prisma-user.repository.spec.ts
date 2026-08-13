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
      updateMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let repo: PrismaUserRepository;

  beforeEach(() => {
    prismaMock = {
      users: {
        create: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    repo = new PrismaUserRepository(prismaMock as unknown as PrismaService);
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
  });
});
