import { Prisma } from '@prisma/client';
import { PrismaAppointmentsRepository } from './prisma-appointments.repository';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { SlotUnavailableError } from '../../domain/AppointmentRepository';

const NOW = new Date('2026-08-17T13:00:00.000Z');
const SLOT = new Date('2026-08-17T13:00:00.000Z');

function fakeAppointmentRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'appt-1',
    user_id: null,
    patient_id: null,
    treatment_id: null,
    appointment_datetime: SLOT,
    status: 'held',
    source: 'public_web',
    whatsapp_name: null,
    whatsapp_phone: null,
    notes: null,
    created_at: NOW,
    hold_expires_at: new Date(NOW.getTime() + 15 * 60 * 1000),
    guest_full_name: null,
    guest_phone: null,
    ...overrides,
  };
}

describe('PrismaAppointmentsRepository', () => {
  let prismaMock: {
    appointments: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
    };
    transaction: jest.Mock;
  };
  let repo: PrismaAppointmentsRepository;

  beforeEach(() => {
    prismaMock = {
      appointments: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prismaMock)),
    };
    repo = new PrismaAppointmentsRepository(
      prismaMock as unknown as PrismaService,
    );
  });

  describe('createHold', () => {
    it('expires stale holds for the slot before inserting, inside one transaction', async () => {
      prismaMock.appointments.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.appointments.create.mockResolvedValue(fakeAppointmentRecord());

      await repo.createHold({
        slot: SLOT,
        holdExpiresAt: NOW,
        treatmentId: null,
        source: 'public_web',
      });

      expect(prismaMock.transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.appointments.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            appointment_datetime: SLOT,
            status: 'held',
          }) as Record<string, unknown>,
          data: { status: 'expired' },
        }),
      );
      expect(prismaMock.appointments.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            appointment_datetime: SLOT,
            status: 'held',
          }) as Record<string, unknown>,
        }),
      );
    });

    it('translates a unique-slot conflict (P2002) into SlotUnavailableError', async () => {
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: 'test',
        },
      );
      prismaMock.appointments.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.appointments.create.mockRejectedValue(error);

      await expect(
        repo.createHold({
          slot: SLOT,
          holdExpiresAt: NOW,
          treatmentId: null,
          source: 'public_web',
        }),
      ).rejects.toThrow(SlotUnavailableError);
    });
  });

  describe('updateGuestContact', () => {
    it('is a no-op (returns null) when the hold is no longer held/vigente, without a second query', async () => {
      prismaMock.appointments.updateMany.mockResolvedValue({ count: 0 });

      const result = await repo.updateGuestContact(
        'appt-1',
        { fullName: 'X', phone: '7' },
        NOW,
      );

      expect(result).toBeNull();
      expect(prismaMock.appointments.findUnique).not.toHaveBeenCalled();
    });

    it('updates and returns the appointment when the hold is still active', async () => {
      prismaMock.appointments.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.appointments.findUnique.mockResolvedValue(
        fakeAppointmentRecord({ guest_full_name: 'X', guest_phone: '7' }),
      );

      const result = await repo.updateGuestContact(
        'appt-1',
        { fullName: 'X', phone: '7' },
        NOW,
      );

      expect(prismaMock.appointments.updateMany).toHaveBeenCalledWith({
        where: { id: 'appt-1', status: 'held', hold_expires_at: { gt: NOW } },
        data: { guest_full_name: 'X', guest_phone: '7' },
      });
      expect(result?.guestFullName).toBe('X');
    });
  });
});
