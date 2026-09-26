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
  const resolver = new ActorResolver(
    { findByUserId } as unknown as IPatientRepository,
    { findActiveByExternalId } as unknown as ChannelIdentityRepository,
    { findById } as unknown as UserRepository,
  );

  beforeEach(() => {
    findByUserId.mockReset();
    findActiveByExternalId.mockReset();
    findById.mockReset();
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

  describe('fromChannelIdentity (CLI-100)', () => {
    const identity = {
      id: 'link-1',
      userId: 'user-1',
      channel: 'whatsapp',
      externalId: '+59171234567',
      verifiedAt: new Date(),
      revokedAt: null,
    };

    it('un número vinculado a una cuenta activa es ese usuario', async () => {
      findActiveByExternalId.mockResolvedValue(identity);
      findById.mockResolvedValue(user(UserRole.PATIENT));
      findByUserId.mockResolvedValue({ id: 'patient-9' });

      await expect(
        resolver.fromChannelIdentity('whatsapp', '+59171234567'),
      ).resolves.toEqual({
        kind: 'user',
        userId: 'user-1',
        role: UserRole.PATIENT,
        patientId: 'patient-9',
      });
      expect(findActiveByExternalId).toHaveBeenCalledWith(
        'whatsapp',
        '+59171234567',
      );
      expect(findById).toHaveBeenCalledWith('user-1');
    });

    it('un número sin vínculo activo (nunca vinculado o revocado) es anónimo', async () => {
      findActiveByExternalId.mockResolvedValue(null);

      await expect(
        resolver.fromChannelIdentity('whatsapp', '+59171234567'),
      ).resolves.toEqual({ kind: 'anonymous' });
      expect(findById).not.toHaveBeenCalled();
    });

    it.each([
      ['dada de baja', () => user(UserRole.ODONTOLOGIST, false)],
      ['que ya no existe', () => null],
    ])('el vínculo de una cuenta %s es anónimo', async (_name, owner) => {
      findActiveByExternalId.mockResolvedValue(identity);
      findById.mockResolvedValue(owner());

      await expect(
        resolver.fromChannelIdentity('whatsapp', '+59171234567'),
      ).resolves.toEqual({ kind: 'anonymous' });
    });
  });

  it('anonymous devuelve un actor anónimo', () => {
    expect(resolver.anonymous()).toEqual({ kind: 'anonymous' });
  });
});
