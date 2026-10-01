import { ForbiddenException } from '@nestjs/common';
import { User } from '../../auth/domain/User';
import { UserRole } from '../../auth/domain/value-objects/UserRole';
import type { UserRepository } from '../../auth/domain/UserRepository';
import type { IPatientRepository } from '../../patients/domain/PatientRepository';
import type { ChannelIdentityRepository } from '../domain/ChannelIdentity';
import { ActorResolver } from './actor-resolver';

function user(role: UserRole, isActive = true): User {
  const now = new Date('2026-09-24T12:00:00Z');
  return new User(
    'user-1',
    'auth-1',
    'a@b.com',
    role,
    'Nombre',
    null,
    null,
    isActive,
    now,
    now,
  );
}

describe('ActorResolver', () => {
  const findByUserId = jest.fn();
  const findActiveByExternalId = jest.fn();
  const findById = jest.fn();
  const findActiveByPhone = jest.fn();
  const resolver = new ActorResolver(
    { findByUserId } as unknown as IPatientRepository,
    { findActiveByExternalId } as unknown as ChannelIdentityRepository,
    { findById, findActiveByPhone } as unknown as UserRepository,
  );

  beforeEach(() => {
    findByUserId.mockReset();
    findActiveByExternalId.mockReset();
    findById.mockReset();
    findActiveByPhone.mockReset();
  });

  it('un paciente con ficha lleva su patientId', async () => {
    findByUserId.mockResolvedValue({ id: 'patient-9' });

    await expect(resolver.fromAppUser(user(UserRole.PATIENT))).resolves.toEqual(
      {
        kind: 'user',
        userId: 'user-1',
        role: UserRole.PATIENT,
        patientId: 'patient-9',
      },
    );
    expect(findByUserId).toHaveBeenCalledWith('user-1');
  });

  it('un paciente sin ficha queda con patientId null', async () => {
    findByUserId.mockResolvedValue(null);

    await expect(
      resolver.fromAppUser(user(UserRole.PATIENT)),
    ).resolves.toMatchObject({ patientId: null });
  });

  it.each([UserRole.ODONTOLOGIST, UserRole.ADMIN])(
    'un %s no busca ficha de paciente',
    async (role) => {
      await expect(resolver.fromAppUser(user(role))).resolves.toEqual({
        kind: 'user',
        userId: 'user-1',
        role,
        patientId: null,
      });
      expect(findByUserId).not.toHaveBeenCalled();
    },
  );

  it('un usuario desactivado recibe 403', async () => {
    await expect(
      resolver.fromAppUser(user(UserRole.ODONTOLOGIST, false)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe('fromChannelSender (CLI-100 + CLI-146)', () => {
    const NUMBER = '+59171234567';
    const identity = {
      id: 'link-1',
      userId: 'user-1',
      channel: 'whatsapp',
      externalId: NUMBER,
      verifiedAt: new Date(),
      revokedAt: null,
    };
    function account(id: string, role: UserRole, isActive = true): User {
      const now = new Date('2026-09-24T12:00:00Z');
      return new User(
        id,
        null,
        null,
        role,
        id,
        null,
        NUMBER,
        isActive,
        now,
        now,
      );
    }

    beforeEach(() => {
      findActiveByExternalId.mockResolvedValue(null);
      findActiveByPhone.mockResolvedValue([]);
    });

    it('un número vinculado con código es esa cuenta, aunque la ficha diga otra cosa', async () => {
      findActiveByExternalId.mockResolvedValue(identity);
      findById.mockResolvedValue(user(UserRole.PATIENT));
      findByUserId.mockResolvedValue({ id: 'patient-9' });

      await expect(
        resolver.fromChannelSender('whatsapp', NUMBER),
      ).resolves.toEqual({
        actor: {
          kind: 'user',
          userId: 'user-1',
          role: UserRole.PATIENT,
          patientId: 'patient-9',
        },
        match: 'linked',
      });
      expect(findActiveByPhone).not.toHaveBeenCalled();
    });

    it('el vínculo de una cuenta dada de baja no vale: sigue con el número de la ficha', async () => {
      findActiveByExternalId.mockResolvedValue(identity);
      findById.mockResolvedValue(user(UserRole.PATIENT, false));

      await expect(
        resolver.fromChannelSender('whatsapp', NUMBER),
      ).resolves.toEqual({ actor: { kind: 'anonymous' }, match: 'unknown' });
      expect(findActiveByPhone).toHaveBeenCalledWith(NUMBER);
    });

    it.each([UserRole.ODONTOLOGIST, UserRole.ADMIN])(
      'el número de un solo %s lo reconoce directo',
      async (role) => {
        findActiveByPhone.mockResolvedValue([account('doc-1', role)]);

        await expect(
          resolver.fromChannelSender('whatsapp', NUMBER),
        ).resolves.toEqual({
          actor: { kind: 'user', userId: 'doc-1', role, patientId: null },
          match: 'staff',
        });
      },
    );

    it('el número de un solo paciente lo reconoce directo, con su ficha', async () => {
      findActiveByPhone.mockResolvedValue([account('pat-1', UserRole.PATIENT)]);
      findByUserId.mockResolvedValue({ id: 'patient-1' });

      await expect(
        resolver.fromChannelSender('whatsapp', NUMBER),
      ).resolves.toEqual({
        actor: {
          kind: 'user',
          userId: 'pat-1',
          role: UserRole.PATIENT,
          patientId: 'patient-1',
        },
        match: 'patient',
      });
    });

    it('si un doctor y un paciente comparten el número, es el doctor', async () => {
      findActiveByPhone.mockResolvedValue([
        account('pat-1', UserRole.PATIENT),
        account('doc-1', UserRole.ODONTOLOGIST),
      ]);

      await expect(
        resolver.fromChannelSender('whatsapp', NUMBER),
      ).resolves.toMatchObject({ actor: { userId: 'doc-1' }, match: 'staff' });
    });

    it.each([
      ['dos pacientes (una familia)', [UserRole.PATIENT, UserRole.PATIENT]],
      ['dos doctores', [UserRole.ODONTOLOGIST, UserRole.ADMIN]],
    ])(
      'un número compartido por %s no se adivina: ambiguous',
      async (_name, roles) => {
        findActiveByPhone.mockResolvedValue(
          roles.map((role, i) => account(`u-${i}`, role)),
        );

        await expect(
          resolver.fromChannelSender('whatsapp', NUMBER),
        ).resolves.toEqual({
          actor: { kind: 'anonymous' },
          match: 'ambiguous',
        });
      },
    );

    it('un número que no es de nadie es un visitante', async () => {
      await expect(
        resolver.fromChannelSender('whatsapp', NUMBER),
      ).resolves.toEqual({ actor: { kind: 'anonymous' }, match: 'unknown' });
    });
  });

  it('anonymous devuelve un actor anónimo', () => {
    expect(resolver.anonymous()).toEqual({ kind: 'anonymous' });
  });
});
