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
    duration_minutes: 30,
    status: 'held',
    source: 'public_web',
    whatsapp_name: null,
    whatsapp_phone: null,
    notes: null,
    created_at: NOW,
    hold_expires_at: new Date(NOW.getTime() + 15 * 60 * 1000),
    guest_full_name: null,
    guest_phone: null,
    baneco_qr_id: null,
    baneco_transaction_id: null,
    baneco_qr_image: null,
    payment_amount: null,
    paid_at: null,
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
        durationMinutes: 30,
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

    // CLI-47: la duración congelada en la cita viene del caller (el service
    // ya resolvió el tratamiento), el repositorio solo la persiste tal cual.
    it('persists the given durationMinutes as duration_minutes', async () => {
      prismaMock.appointments.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.appointments.create.mockResolvedValue(
        fakeAppointmentRecord({ duration_minutes: 90 }),
      );

      await repo.createHold({
        slot: SLOT,
        holdExpiresAt: NOW,
        treatmentId: 'treatment-1',
        durationMinutes: 90,
        source: 'public_web',
      });

      expect(prismaMock.appointments.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            duration_minutes: 90,
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
          durationMinutes: 30,
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

  describe('attachQr', () => {
    it('is a no-op (returns null) when the appointment is no longer held', async () => {
      prismaMock.appointments.updateMany.mockResolvedValue({ count: 0 });

      const result = await repo.attachQr('appt-1', {
        qrId: 'qr-1',
        qrImage: 'base64',
        amount: 50,
      });

      expect(result).toBeNull();
      expect(prismaMock.appointments.findUnique).not.toHaveBeenCalled();
    });

    it('saves the QR reference and returns the updated appointment when still held', async () => {
      prismaMock.appointments.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.appointments.findUnique.mockResolvedValue(
        fakeAppointmentRecord({ baneco_qr_id: 'qr-1', payment_amount: 50 }),
      );

      const result = await repo.attachQr('appt-1', {
        qrId: 'qr-1',
        qrImage: 'base64',
        amount: 50,
      });

      expect(prismaMock.appointments.updateMany).toHaveBeenCalledWith({
        where: { id: 'appt-1', status: 'held' },
        data: {
          baneco_qr_id: 'qr-1',
          baneco_qr_image: 'base64',
          payment_amount: 50,
        },
      });
      expect(result?.banecoQrId).toBe('qr-1');
      expect(result?.paymentAmount).toBe(50);
    });
  });

  describe('findByQrId', () => {
    it('maps the record when found', async () => {
      prismaMock.appointments.findUnique.mockResolvedValue(
        fakeAppointmentRecord({ baneco_qr_id: 'qr-1' }),
      );

      const result = await repo.findByQrId('qr-1');

      expect(prismaMock.appointments.findUnique).toHaveBeenCalledWith({
        where: { baneco_qr_id: 'qr-1' },
      });
      expect(result?.banecoQrId).toBe('qr-1');
    });

    it('returns null when not found', async () => {
      prismaMock.appointments.findUnique.mockResolvedValue(null);

      expect(await repo.findByQrId('missing')).toBeNull();
    });
  });

  describe('findHeldWithQr', () => {
    it('queries held appointments with a QR already attached, expired or not', async () => {
      prismaMock.appointments.findMany.mockResolvedValue([
        fakeAppointmentRecord({ baneco_qr_id: 'qr-1' }),
      ]);

      const result = await repo.findHeldWithQr();

      expect(prismaMock.appointments.findMany).toHaveBeenCalledWith({
        where: {
          status: 'held',
          baneco_qr_id: { not: null },
        },
      });
      expect(result).toHaveLength(1);
      expect(result[0].banecoQrId).toBe('qr-1');
    });
  });

  describe('markExpired', () => {
    it('conditionally updates a held appointment to expired', async () => {
      prismaMock.appointments.updateMany.mockResolvedValue({ count: 1 });

      await repo.markExpired('appt-1');

      expect(prismaMock.appointments.updateMany).toHaveBeenCalledWith({
        where: { id: 'appt-1', status: 'held' },
        data: { status: 'expired' },
      });
    });
  });
});
