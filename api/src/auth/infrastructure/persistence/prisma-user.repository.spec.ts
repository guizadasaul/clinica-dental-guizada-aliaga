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

/** Primer argumento de la primera llamada a un mock, tipado — evita el `any` de `mock.calls[0][0]`. */
function firstCallArg<T>(mock: jest.Mock): T {
  return (mock.mock.calls as unknown[][])[0][0] as T;
}

describe('PrismaUserRepository', () => {
  let prismaMock: {
    users: {
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      upsert: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
    };
    doctor_profiles: { count: jest.Mock; updateMany: jest.Mock };
    transaction: jest.Mock;
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
        findMany: jest.fn(),
      },
      // Por defecto ningún user es doctor: los tests de pacientes/admin no cambian.
      doctor_profiles: {
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn(),
      },
      transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prismaMock)),
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

      const upsertArgs = firstCallArg<{
        update: Record<string, unknown>;
      }>(prismaMock.users.upsert);
      expect(upsertArgs.update).not.toHaveProperty('email');
    });

    // CLI-144: el teléfono de users es el de la ficha (el oficial): un login
    // no lo reemplaza; solo se usa al crear la fila.
    it('never replaces the ficha phone on re-sync, but uses the login phone when creating the row', async () => {
      prismaMock.users.upsert.mockResolvedValue(
        fakeUserRecord({ auth_user_id: AUTH_USER_ID, phone: '+59170000001' }),
      );

      await repo.upsertByAuthUserId({
        authUserId: AUTH_USER_ID,
        email: null,
        phone: '59179999999',
        displayName: null,
        photoUrl: null,
      });

      const upsertArgs = firstCallArg<{
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }>(prismaMock.users.upsert);
      expect(upsertArgs.update).not.toHaveProperty('phone');
      expect(upsertArgs.create['phone']).toBe('59179999999');
    });

    // CLI-144: un login por teléfono no trae nombre; no borra el de la ficha.
    it('does not overwrite an existing display_name with null', async () => {
      prismaMock.users.upsert.mockResolvedValue(
        fakeUserRecord({ auth_user_id: AUTH_USER_ID }),
      );

      await repo.upsertByAuthUserId({
        authUserId: AUTH_USER_ID,
        email: null,
        phone: '59171234567',
        displayName: null,
        photoUrl: null,
      });

      const upsertArgs = firstCallArg<{
        update: Record<string, unknown>;
      }>(prismaMock.users.upsert);
      expect(upsertArgs.update).not.toHaveProperty('display_name');
    });
  });

  // CLI-77: el nombre público de un doctor lo carga el admin, un login no lo pisa.
  describe('upsertByAuthUserId — doctor public name', () => {
    it('keeps display_name untouched for a user that has a doctor profile (but still syncs the avatar)', async () => {
      prismaMock.doctor_profiles.count.mockResolvedValue(1);
      prismaMock.users.upsert.mockResolvedValue(
        fakeUserRecord({ auth_user_id: AUTH_USER_ID, role: 'odontologist' }),
      );

      await repo.upsertByAuthUserId({
        authUserId: AUTH_USER_ID,
        email: 'doc@b.com',
        displayName: 'Nombre de Google',
        photoUrl: 'https://google.example/avatar.jpg',
      });

      expect(prismaMock.doctor_profiles.count).toHaveBeenCalledWith({
        where: { users: { auth_user_id: AUTH_USER_ID } },
      });
      const upsertArgs = firstCallArg<{ update: Record<string, unknown> }>(
        prismaMock.users.upsert,
      );
      expect(upsertArgs.update).not.toHaveProperty('display_name');
      expect(upsertArgs.update['photo_url']).toBe(
        'https://google.example/avatar.jpg',
      );
    });

    it('keeps syncing display_name for everyone else (patients, admin)', async () => {
      prismaMock.users.upsert.mockResolvedValue(
        fakeUserRecord({ auth_user_id: AUTH_USER_ID }),
      );

      await repo.upsertByAuthUserId({
        authUserId: AUTH_USER_ID,
        email: 'a@b.com',
        displayName: 'Real Name',
        photoUrl: null,
      });

      const upsertArgs = firstCallArg<{ update: Record<string, unknown> }>(
        prismaMock.users.upsert,
      );
      expect(upsertArgs.update['display_name']).toBe('Real Name');
    });

    it('also keeps the public name when the email-relink fallback hits a doctor row', async () => {
      prismaMock.users.upsert.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      prismaMock.doctor_profiles.count
        .mockResolvedValueOnce(0) // por auth_user_id: todavía no es de nadie
        .mockResolvedValueOnce(1); // por email: la fila que se re-vincula es de un doctor
      prismaMock.users.update.mockResolvedValue(
        fakeUserRecord({ auth_user_id: AUTH_USER_ID, role: 'odontologist' }),
      );

      await repo.upsertByAuthUserId({
        authUserId: AUTH_USER_ID,
        email: 'doc@b.com',
        displayName: 'Nombre de Google',
        photoUrl: null,
      });

      const updateArgs = firstCallArg<{ data: Record<string, unknown> }>(
        prismaMock.users.update,
      );
      expect(updateArgs.data).not.toHaveProperty('display_name');
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

    it("keeps the doctor's public display_name and makes a pending doctor bookable when the invite is redeemed (CLI-77)", async () => {
      prismaMock.doctor_profiles.count.mockResolvedValue(1);
      prismaMock.users.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.users.findUnique.mockResolvedValue(
        fakeUserRecord({
          auth_user_id: AUTH_USER_ID,
          role: 'odontologist',
          display_name: 'Dra. Marylu Aliaga',
        }),
      );

      const result = await repo.linkAuthIdentity(USER_ID, {
        authUserId: AUTH_USER_ID,
        email: 'marylu@b.com',
        displayName: 'marylu aliaga (google)',
        photoUrl: 'https://google.example/avatar.jpg',
      });

      const updateArgs = firstCallArg<{ data: Record<string, unknown> }>(
        prismaMock.users.updateMany,
      );
      expect(updateArgs.data).not.toHaveProperty('display_name');
      expect(updateArgs.data['photo_url']).toBe(
        'https://google.example/avatar.jpg',
      );
      expect(prismaMock.doctor_profiles.updateMany).toHaveBeenCalledWith({
        where: { user_id: USER_ID, users: { is_active: true } },
        data: { is_bookable: true, updated_at: expect.any(Date) as Date },
      });
      expect(result?.displayName).toBe('Dra. Marylu Aliaga');
    });

    it('does not touch doctor_profiles nor keep the name for a patient', async () => {
      prismaMock.users.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.users.findUnique.mockResolvedValue(
        fakeUserRecord({ auth_user_id: AUTH_USER_ID }),
      );

      await repo.linkAuthIdentity(USER_ID, {
        authUserId: AUTH_USER_ID,
        email: 'a@b.com',
        displayName: 'Real Name',
        photoUrl: null,
      });

      const updateArgs = firstCallArg<{ data: Record<string, unknown> }>(
        prismaMock.users.updateMany,
      );
      expect(updateArgs.data['display_name']).toBe('Real Name');
      expect(prismaMock.doctor_profiles.updateMany).not.toHaveBeenCalled();
    });

    it('does not make a doctor bookable when the row was already linked (idempotent no-op)', async () => {
      prismaMock.doctor_profiles.count.mockResolvedValue(1);
      prismaMock.users.updateMany.mockResolvedValue({ count: 0 });

      const result = await repo.linkAuthIdentity(USER_ID, {
        authUserId: AUTH_USER_ID,
        email: 'a@b.com',
        displayName: 'Real Name',
        photoUrl: null,
      });

      expect(result).toBeNull();
      expect(prismaMock.doctor_profiles.updateMany).not.toHaveBeenCalled();
    });

    it('is idempotent: returns null (without reading the linked row back) when it was already linked', async () => {
      prismaMock.users.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.users.findUnique.mockResolvedValue({ phone: null });

      const result = await repo.linkAuthIdentity(USER_ID, {
        authUserId: AUTH_USER_ID,
        email: 'a@b.com',
        displayName: 'Real Name',
        photoUrl: null,
      });

      expect(result).toBeNull();
      // Solo la lectura previa del teléfono de la ficha (CLI-144).
      expect(prismaMock.users.findUnique).toHaveBeenCalledTimes(1);
      expect(prismaMock.users.findUnique).toHaveBeenCalledWith({
        where: { id: USER_ID },
        select: { phone: true },
      });
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

    it("does not overwrite the invited patient's existing email when linking a phone-only login (null email)", async () => {
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

      const updateManyArgs = firstCallArg<{
        data: Record<string, unknown>;
      }>(prismaMock.users.updateMany);
      expect(updateManyArgs.data).not.toHaveProperty('email');
    });

    // CLI-144: la ficha ya tenía teléfono → es el oficial, el del login no lo
    // reemplaza (antes el login pasaba en silencio al número de la ficha).
    it('keeps the ficha phone when the invited patient already had one', async () => {
      prismaMock.users.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.users.findUnique.mockResolvedValue(
        fakeUserRecord({ auth_user_id: AUTH_USER_ID, phone: '+59170000001' }),
      );

      await repo.linkAuthIdentity(USER_ID, {
        authUserId: AUTH_USER_ID,
        email: null,
        phone: '59179999999',
        displayName: null,
        photoUrl: null,
      });

      const updateManyArgs = firstCallArg<{
        data: Record<string, unknown>;
      }>(prismaMock.users.updateMany);
      expect(updateManyArgs.data).not.toHaveProperty('phone');
    });

    it('stores the login phone when the ficha had none', async () => {
      prismaMock.users.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.users.findUnique
        .mockResolvedValueOnce({ phone: null })
        .mockResolvedValueOnce(
          fakeUserRecord({ auth_user_id: AUTH_USER_ID, phone: '59179999999' }),
        );

      await repo.linkAuthIdentity(USER_ID, {
        authUserId: AUTH_USER_ID,
        email: null,
        phone: '59179999999',
        displayName: null,
        photoUrl: null,
      });

      const updateManyArgs = firstCallArg<{
        data: Record<string, unknown>;
      }>(prismaMock.users.updateMany);
      expect(updateManyArgs.data['phone']).toBe('59179999999');
    });

    // CLI-144: un registro por teléfono no trae nombre → no borra el de la ficha.
    it("does not overwrite the invited patient's name with null", async () => {
      prismaMock.users.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.users.findUnique.mockResolvedValue(
        fakeUserRecord({
          auth_user_id: AUTH_USER_ID,
          display_name: 'Juan Pérez Quispe',
        }),
      );

      await repo.linkAuthIdentity(USER_ID, {
        authUserId: AUTH_USER_ID,
        email: null,
        phone: '59171234567',
        displayName: null,
        photoUrl: null,
      });

      const updateManyArgs = firstCallArg<{
        data: Record<string, unknown>;
      }>(prismaMock.users.updateMany);
      expect(updateManyArgs.data).not.toHaveProperty('display_name');
    });
  });

  it('linkAuthIdentity propaga un error que no es de email duplicado', async () => {
    const boom = new Error('connection lost');
    prismaMock.transaction.mockRejectedValue(boom);

    await expect(
      repo.linkAuthIdentity(USER_ID, {
        authUserId: AUTH_USER_ID,
        email: 'a@b.com',
        displayName: 'Real Name',
        photoUrl: null,
      }),
    ).rejects.toBe(boom);
  });

  describe('findActiveByPhone (CLI-146)', () => {
    it('trae candidatos activos por los últimos 8 dígitos y compara el número normalizado', async () => {
      prismaMock.users.findMany.mockResolvedValue([
        fakeUserRecord({ id: 'con-mas', phone: '+59171234567' }),
        fakeUserRecord({ id: 'sin-mas', phone: '59171234567' }),
        fakeUserRecord({ id: 'local', phone: '71234567' }),
        // Mismos 8 dígitos finales, pero de otro país: no es el mismo número.
        fakeUserRecord({ id: 'otro-pais', phone: '+5491171234567' }),
        fakeUserRecord({ id: 'invalido', phone: '12' }),
        fakeUserRecord({ id: 'sin-telefono', phone: null }),
      ]);

      const users = await repo.findActiveByPhone('+59171234567');

      expect(prismaMock.users.findMany).toHaveBeenCalledWith({
        where: { is_active: true, phone: { endsWith: '71234567' } },
      });
      expect(users.map((u) => u.id)).toEqual(['con-mas', 'sin-mas', 'local']);
    });
  });

  describe('findById', () => {
    it('busca por users.id y mapea el usuario', async () => {
      prismaMock.users.findUnique.mockResolvedValue(fakeUserRecord());

      await expect(repo.findById(USER_ID)).resolves.toMatchObject({
        id: USER_ID,
      });
      expect(prismaMock.users.findUnique).toHaveBeenCalledWith({
        where: { id: USER_ID },
      });
    });

    it('devuelve null si no existe', async () => {
      prismaMock.users.findUnique.mockResolvedValue(null);

      await expect(repo.findById(USER_ID)).resolves.toBeNull();
    });
  });

  describe('findByAuthUserId', () => {
    it('busca por el uid de Supabase y mapea el usuario', async () => {
      prismaMock.users.findUnique.mockResolvedValue(
        fakeUserRecord({ auth_user_id: AUTH_USER_ID }),
      );

      const user = await repo.findByAuthUserId(AUTH_USER_ID);

      expect(user).toMatchObject({ id: USER_ID, authUserId: AUTH_USER_ID });
      expect(prismaMock.users.findUnique).toHaveBeenCalledWith({
        where: { auth_user_id: AUTH_USER_ID },
      });
    });

    it('devuelve null si nadie tiene ese uid', async () => {
      prismaMock.users.findUnique.mockResolvedValue(null);

      await expect(repo.findByAuthUserId(AUTH_USER_ID)).resolves.toBeNull();
    });
  });

  describe('updateContactInfo', () => {
    function knownError(code: string) {
      return new Prisma.PrismaClientKnownRequestError('x', {
        code,
        clientVersion: 'test',
      });
    }

    it('actualiza solo los datos que vinieron', async () => {
      prismaMock.users.update.mockResolvedValue(fakeUserRecord());

      await repo.updateContactInfo(USER_ID, { phone: '59170000000' });

      const args = firstCallArg<{
        where: unknown;
        data: Record<string, unknown>;
      }>(prismaMock.users.update);
      expect(args.where).toEqual({ id: USER_ID });
      expect(args.data).toEqual({
        phone: '59170000000',
        updated_at: expect.any(Date) as Date,
      });
    });

    it('mapea email, teléfono y nombre cuando vienen', async () => {
      prismaMock.users.update.mockResolvedValue(fakeUserRecord());

      await repo.updateContactInfo(USER_ID, {
        email: 'ana@example.com',
        phone: '59170000000',
        displayName: 'Ana Pérez',
      });

      expect(
        firstCallArg<{ data: Record<string, unknown> }>(prismaMock.users.update)
          .data,
      ).toMatchObject({
        email: 'ana@example.com',
        phone: '59170000000',
        display_name: 'Ana Pérez',
      });
    });

    it('devuelve null si el usuario no existe (P2025)', async () => {
      prismaMock.users.update.mockRejectedValue(knownError('P2025'));

      await expect(
        repo.updateContactInfo(USER_ID, { phone: '1' }),
      ).resolves.toBeNull();
    });

    it('email de otra cuenta → 409 (P2002)', async () => {
      prismaMock.users.update.mockRejectedValue(knownError('P2002'));

      await expect(
        repo.updateContactInfo(USER_ID, { email: 'otro@example.com' }),
      ).rejects.toThrow(ConflictException);
    });

    it.each([
      ['otro error conocido de Prisma', knownError('P2003')],
      ['un error cualquiera', new Error('connection lost')],
    ])('propaga %s', async (_, error) => {
      prismaMock.users.update.mockRejectedValue(error);

      await expect(
        repo.updateContactInfo(USER_ID, { phone: '1' }),
      ).rejects.toBe(error);
    });
  });
});
