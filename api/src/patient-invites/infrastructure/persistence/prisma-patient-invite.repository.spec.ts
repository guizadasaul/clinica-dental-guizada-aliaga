import { PrismaPatientInviteRepository } from './prisma-patient-invite.repository';
import { PrismaService } from '../../../shared/prisma/prisma.service';

const NOW = new Date('2026-08-13T12:00:00.000Z');

describe('PrismaPatientInviteRepository', () => {
  let prismaMock: {
    patient_invites: {
      create: jest.Mock;
      updateMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
    };
    patients: { findUnique: jest.Mock };
    transaction: jest.Mock;
  };
  let repo: PrismaPatientInviteRepository;

  beforeEach(() => {
    prismaMock = {
      patient_invites: {
        create: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
      },
      patients: { findUnique: jest.fn() },
      transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prismaMock)),
    };
    repo = new PrismaPatientInviteRepository(
      prismaMock as unknown as PrismaService,
    );
  });

  describe('create', () => {
    it('persists user_id and patient_id (patient invite)', async () => {
      prismaMock.patient_invites.create.mockResolvedValue({
        id: 'invite-1',
        user_id: 'user-1',
        patient_id: 'patient-1',
        channel: 'email',
        expires_at: NOW,
        used_at: null,
        created_at: NOW,
      });

      await repo.create({
        userId: 'user-1',
        patientId: 'patient-1',
        channel: 'email',
        tokenHash: 'hash-1',
        expiresAt: NOW,
      });

      expect(prismaMock.patient_invites.create).toHaveBeenCalledWith({
        data: {
          user_id: 'user-1',
          patient_id: 'patient-1',
          channel: 'email',
          token_hash: 'hash-1',
          expires_at: NOW,
        },
      });
    });

    it('persists patient_id as null when omitted (e.g. a doctor invite)', async () => {
      prismaMock.patient_invites.create.mockResolvedValue({
        id: 'invite-1',
        user_id: 'user-doctor-1',
        patient_id: null,
        channel: 'email',
        expires_at: NOW,
        used_at: null,
        created_at: NOW,
      });

      await repo.create({
        userId: 'user-doctor-1',
        channel: 'email',
        tokenHash: 'hash-1',
        expiresAt: NOW,
      });

      expect(prismaMock.patient_invites.create).toHaveBeenCalledWith({
        data: {
          user_id: 'user-doctor-1',
          patient_id: null,
          channel: 'email',
          token_hash: 'hash-1',
          expires_at: NOW,
        },
      });
    });
  });

  describe('invalidatePendingForUser', () => {
    it('marks every pending invite of the user as used, regardless of channel', async () => {
      prismaMock.patient_invites.updateMany.mockResolvedValue({ count: 2 });

      await repo.invalidatePendingForUser('user-1', NOW);

      expect(prismaMock.patient_invites.updateMany).toHaveBeenCalledWith({
        where: { user_id: 'user-1', used_at: null },
        data: { used_at: NOW },
      });
    });
  });

  describe('redeemByTokenHash', () => {
    it('claims the invite with a conditional UPDATE (WHERE token_hash AND used_at IS NULL AND expires_at > now)', async () => {
      prismaMock.patient_invites.updateMany
        .mockResolvedValueOnce({ count: 1 }) // claim the matched invite
        .mockResolvedValueOnce({ count: 0 }); // invalidate siblings (none in this test)
      prismaMock.patient_invites.findUnique.mockResolvedValue({
        user_id: 'user-1',
        patient_id: 'patient-1',
      });

      const result = await repo.redeemByTokenHash('hash-1', NOW);

      expect(prismaMock.patient_invites.updateMany).toHaveBeenNthCalledWith(1, {
        where: { token_hash: 'hash-1', used_at: null, expires_at: { gt: NOW } },
        data: { used_at: NOW },
      });
      expect(result).toEqual({ userId: 'user-1', patientId: 'patient-1' });
    });

    it('resolves patientId as null when the invite has none (e.g. a doctor invite)', async () => {
      prismaMock.patient_invites.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });
      prismaMock.patient_invites.findUnique.mockResolvedValue({
        user_id: 'user-1',
        patient_id: null,
      });

      const result = await repo.redeemByTokenHash('hash-1', NOW);

      expect(result).toEqual({ userId: 'user-1', patientId: null });
    });

    it('is idempotent: a duplicate/late redemption never reaches the sibling-invalidation or lookup', async () => {
      prismaMock.patient_invites.updateMany.mockResolvedValue({ count: 0 });

      const result = await repo.redeemByTokenHash('hash-1', NOW);

      expect(result).toBeNull();
      expect(prismaMock.patient_invites.findUnique).not.toHaveBeenCalled();
    });

    it('invalidates every other pending invite for the same user (e.g. sent by both channels)', async () => {
      prismaMock.patient_invites.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });
      prismaMock.patient_invites.findUnique.mockResolvedValue({
        user_id: 'user-1',
        patient_id: 'patient-1',
      });

      await repo.redeemByTokenHash('hash-1', NOW);

      expect(prismaMock.patient_invites.updateMany).toHaveBeenNthCalledWith(2, {
        where: { user_id: 'user-1', used_at: null },
        data: { used_at: NOW },
      });
    });
  });

  describe('findPatientContactInfo', () => {
    it('returns null when the patient does not exist', async () => {
      prismaMock.patients.findUnique.mockResolvedValue(null);

      expect(await repo.findPatientContactInfo('missing')).toBeNull();
    });

    it('maps first_name/last_name_paternal/phone and the joined user email', async () => {
      prismaMock.patients.findUnique.mockResolvedValue({
        user_id: 'user-1',
        first_name: 'Juana',
        last_name_paternal: 'Perez',
        users: { email: 'juana@example.com', phone: '70011122' },
      });

      const result = await repo.findPatientContactInfo('patient-1');

      expect(prismaMock.patients.findUnique).toHaveBeenCalledWith({
        where: { id: 'patient-1' },
        include: { users: true },
      });
      expect(result).toEqual({
        userId: 'user-1',
        fullName: 'Juana Perez',
        phone: '70011122',
        email: 'juana@example.com',
      });
    });

    it('includes last_name_maternal in fullName when present (CLI-43)', async () => {
      prismaMock.patients.findUnique.mockResolvedValue({
        user_id: 'user-1',
        first_name: 'Juana',
        last_name_paternal: 'Perez',
        last_name_maternal: 'Gomez',
        phone: '70011122',
        users: { email: 'juana@example.com' },
      });

      const result = await repo.findPatientContactInfo('patient-1');

      expect(result?.fullName).toBe('Juana Perez Gomez');
    });
  });

  describe('findTokenStatus', () => {
    const HOUR = 60 * 60 * 1000;

    function record(overrides: Record<string, unknown> = {}) {
      return {
        used_at: null,
        expires_at: new Date(NOW.getTime() + HOUR),
        users: { role: 'patient', phone: null },
        ...overrides,
      };
    }

    it('reads by token_hash and never writes (never consumes the token)', async () => {
      prismaMock.patient_invites.findUnique.mockResolvedValue(record());

      await repo.findTokenStatus('hash-1', NOW);

      expect(prismaMock.patient_invites.findUnique).toHaveBeenCalledWith({
        where: { token_hash: 'hash-1' },
        select: {
          used_at: true,
          expires_at: true,
          users: { select: { role: true, phone: true } },
        },
      });
      expect(prismaMock.patient_invites.updateMany).not.toHaveBeenCalled();
    });

    it('returns null when the token does not exist', async () => {
      prismaMock.patient_invites.findUnique.mockResolvedValue(null);

      expect(await repo.findTokenStatus('unknown', NOW)).toBeNull();
    });

    it('is valid and kind=patient for a pending invite of a patient', async () => {
      prismaMock.patient_invites.findUnique.mockResolvedValue(record());

      expect(await repo.findTokenStatus('hash-1', NOW)).toEqual({
        valid: true,
        kind: 'patient',
        phone: null,
      });
    });

    // CLI-144: el teléfono de la ficha viaja para validar el registro por
    // teléfono (el servicio decide qué parte se expone).
    it('includes the phone of the invited user', async () => {
      prismaMock.patient_invites.findUnique.mockResolvedValue(
        record({ users: { role: 'patient', phone: '+59171234567' } }),
      );

      expect(await repo.findTokenStatus('hash-1', NOW)).toMatchObject({
        phone: '+59171234567',
      });
    });

    it('is valid and kind=doctor for a pending invite of an odontologist', async () => {
      prismaMock.patient_invites.findUnique.mockResolvedValue(
        record({ users: { role: 'odontologist' } }),
      );

      expect(await repo.findTokenStatus('hash-1', NOW)).toEqual({
        valid: true,
        kind: 'doctor',
      });
    });

    it('treats any non-patient role (e.g. the admin, invited with the same mechanism) as kind=doctor', async () => {
      prismaMock.patient_invites.findUnique.mockResolvedValue(
        record({ users: { role: 'admin' } }),
      );

      expect(await repo.findTokenStatus('hash-1', NOW)).toEqual({
        valid: true,
        kind: 'doctor',
      });
    });

    it('is not valid but still reports the kind once the invite expired', async () => {
      prismaMock.patient_invites.findUnique.mockResolvedValue(
        record({
          expires_at: new Date(NOW.getTime() - 1),
          users: { role: 'odontologist' },
        }),
      );

      expect(await repo.findTokenStatus('hash-1', NOW)).toEqual({
        valid: false,
        kind: 'doctor',
      });
    });

    it('is not valid but still reports the kind once the invite was used', async () => {
      prismaMock.patient_invites.findUnique.mockResolvedValue(
        record({ used_at: new Date(NOW.getTime() - HOUR) }),
      );

      expect(await repo.findTokenStatus('hash-1', NOW)).toEqual({
        valid: false,
        kind: 'patient',
        phone: null,
      });
    });

    it('an invite that expires exactly now is no longer valid (expires_at > now is required)', async () => {
      prismaMock.patient_invites.findUnique.mockResolvedValue(
        record({ expires_at: NOW }),
      );

      expect((await repo.findTokenStatus('hash-1', NOW))?.valid).toBe(false);
    });
  });
});
