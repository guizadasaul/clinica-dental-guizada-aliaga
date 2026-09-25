import { Prisma } from '@prisma/client';
import { PrismaAppointmentsRepository } from './prisma-appointments.repository';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  GuestEmailBelongsToAccountError,
  GuestPhoneBelongsToAccountError,
  GuestPhoneConflictError,
  SlotUnavailableError,
} from '../../domain/AppointmentRepository';

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
    guest_first_name: null,
    guest_last_name_paternal: null,
    guest_last_name_maternal: null,
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
    users: { findUnique: jest.Mock; findFirst: jest.Mock };
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
      users: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
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
        doctorId: 'doctor-1',
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
            doctor_id: 'doctor-1',
            appointment_datetime: SLOT,
            status: 'held',
          }) as Record<string, unknown>,
          data: { status: 'expired' },
        }),
      );
      expect(prismaMock.appointments.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            doctor_id: 'doctor-1',
            appointment_datetime: SLOT,
            status: 'held',
          }) as Record<string, unknown>,
        }),
      );
    });

    // CLI-56: reservar al doctor A no debe tocar/consultar nada del doctor B
    // — el guard de holds vencidos y el insert van scoped a doctor_id.
    it('scopes the stale-hold guard to the given doctor only', async () => {
      prismaMock.appointments.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.appointments.create.mockResolvedValue(
        fakeAppointmentRecord({ doctor_id: 'doctor-b' }),
      );

      await repo.createHold({
        doctorId: 'doctor-b',
        slot: SLOT,
        holdExpiresAt: NOW,
        treatmentId: null,
        durationMinutes: 30,
        source: 'public_web',
      });

      expect(prismaMock.appointments.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            doctor_id: 'doctor-b',
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
        doctorId: 'doctor-1',
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
          doctorId: 'doctor-1',
          slot: SLOT,
          holdExpiresAt: NOW,
          treatmentId: null,
          durationMinutes: 30,
          source: 'public_web',
        }),
      ).rejects.toThrow(SlotUnavailableError);
    });
  });

  describe('findForPatient (CLI-91)', () => {
    it('trae solo citas confirmadas de ESE paciente, con doctor y tratamiento', async () => {
      const from = new Date('2026-09-25T12:00:00Z');
      prismaMock.appointments.findMany.mockResolvedValue([
        fakeAppointmentRecord({
          status: 'confirmed',
          patient_id: 'patient-1',
          duration_minutes: 60,
          users: { display_name: 'Dr. Ariel Guizada' },
          treatments: { name: 'Limpieza' },
        }),
      ]);

      const result = await repo.findForPatient('patient-1', {
        from,
        order: 'asc',
        limit: 1,
      });

      expect(prismaMock.appointments.findMany).toHaveBeenCalledWith({
        where: {
          patient_id: 'patient-1',
          status: 'confirmed',
          appointment_datetime: { gte: from },
        },
        include: { users: true, treatments: true },
        orderBy: { appointment_datetime: 'asc' },
        take: 1,
      });
      expect(result).toEqual([
        {
          id: 'appt-1',
          appointmentDatetime: SLOT,
          durationMinutes: 60,
          doctorName: 'Dr. Ariel Guizada',
          treatmentName: 'Limpieza',
        },
      ]);
    });

    it('con `to` filtra hacia atrás, y tolera citas sin tratamiento', async () => {
      const to = new Date('2026-09-25T12:00:00Z');
      prismaMock.appointments.findMany.mockResolvedValue([
        fakeAppointmentRecord({
          status: 'confirmed',
          users: { display_name: null },
          treatments: null,
        }),
      ]);

      const [item] = await repo.findForPatient('patient-1', {
        to,
        order: 'desc',
        limit: 5,
      });

      const args = (
        prismaMock.appointments.findMany.mock.calls as unknown[][]
      )[0][0] as {
        where: Record<string, unknown>;
      };
      expect(args.where).toMatchObject({ appointment_datetime: { lt: to } });
      expect(item).toMatchObject({ doctorName: null, treatmentName: null });
    });

    it('sin rango no filtra por fecha', async () => {
      prismaMock.appointments.findMany.mockResolvedValue([]);

      await repo.findForPatient('patient-1', { order: 'asc', limit: 3 });

      const args = (
        prismaMock.appointments.findMany.mock.calls as unknown[][]
      )[0][0] as {
        where: Record<string, unknown>;
      };
      expect(args.where).not.toHaveProperty('appointment_datetime');
    });
  });

  describe('findForAgenda', () => {
    // CLI-57: la agenda de un doctor no debe traer turnos de otro.
    it('scopes the query to the given doctorId', async () => {
      prismaMock.appointments.findMany.mockResolvedValue([]);

      await repo.findForAgenda({ doctorId: 'doctor-1' });

      expect(prismaMock.appointments.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            doctor_id: 'doctor-1',
          }) as Record<string, unknown>,
        }),
      );
    });

    // CLI-110: agenda común.
    it('without doctorId does not filter by doctor', async () => {
      prismaMock.appointments.findMany.mockResolvedValue([]);

      await repo.findForAgenda({ status: 'confirmed' });

      const args = (
        prismaMock.appointments.findMany.mock.calls as unknown[][]
      )[0][0] as {
        where: Record<string, unknown>;
      };
      expect(args.where).not.toHaveProperty('doctor_id');
      expect(args.where).toMatchObject({ status: 'confirmed' });
    });

    it('carries the doctor id, name and agenda color of each appointment', async () => {
      prismaMock.appointments.findMany.mockResolvedValue([
        fakeAppointmentRecord({
          status: 'confirmed',
          doctor_id: 'doctor-2',
          patients: null,
          users: {
            display_name: 'Dra. Marylu',
            doctor_profiles: { color: '#db2777' },
          },
        }),
      ]);

      const [item] = await repo.findForAgenda({});

      expect(item).toMatchObject({
        doctorId: 'doctor-2',
        doctorName: 'Dra. Marylu',
        doctorColor: '#db2777',
      });
    });
  });

  describe('findActiveBetween', () => {
    it('scopes the query to the given doctorId', async () => {
      prismaMock.appointments.findMany.mockResolvedValue([]);
      const from = new Date('2026-08-17T00:00:00.000Z');
      const to = new Date('2026-08-18T00:00:00.000Z');

      await repo.findActiveBetween(from, to, NOW, 'doctor-1');

      expect(prismaMock.appointments.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            doctor_id: 'doctor-1',
          }) as Record<string, unknown>,
        }),
      );
    });
  });

  describe('updateGuestContact', () => {
    it('is a no-op (returns null) when the hold is no longer held/vigente, without a second query', async () => {
      prismaMock.appointments.updateMany.mockResolvedValue({ count: 0 });

      const result = await repo.updateGuestContact(
        'appt-1',
        {
          firstName: 'X',
          lastNamePaternal: 'Y',
          lastNameMaternal: null,
          phone: '7',
          email: null,
        },
        NOW,
      );

      expect(result).toBeNull();
      expect(prismaMock.appointments.findUnique).not.toHaveBeenCalled();
    });

    it('updates and returns the appointment when the hold is still active', async () => {
      prismaMock.appointments.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.appointments.findUnique.mockResolvedValue(
        fakeAppointmentRecord({
          guest_first_name: 'X',
          guest_last_name_paternal: 'Y',
          guest_phone: '7',
        }),
      );

      const result = await repo.updateGuestContact(
        'appt-1',
        {
          firstName: 'X',
          lastNamePaternal: 'Y',
          lastNameMaternal: null,
          phone: '7',
          email: null,
        },
        NOW,
      );

      expect(prismaMock.appointments.updateMany).toHaveBeenCalledWith({
        where: { id: 'appt-1', status: 'held', hold_expires_at: { gt: NOW } },
        data: {
          guest_first_name: 'X',
          guest_last_name_paternal: 'Y',
          guest_last_name_maternal: null,
          guest_phone: '7',
          guest_email: null,
        },
      });
      expect(result?.guestFirstName).toBe('X');
      expect(result?.guestLastNamePaternal).toBe('Y');
    });

    it('translates a unique-guest_phone conflict (P2002) into GuestPhoneConflictError', async () => {
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: 'test',
        },
      );
      prismaMock.appointments.updateMany.mockRejectedValue(error);

      await expect(
        repo.updateGuestContact(
          'appt-1',
          {
            firstName: 'X',
            lastNamePaternal: 'Y',
            lastNameMaternal: null,
            phone: '7',
            email: null,
          },
          NOW,
        ),
      ).rejects.toThrow(GuestPhoneConflictError);
    });

    it('throws GuestEmailBelongsToAccountError when the email already belongs to a user, without touching appointments', async () => {
      prismaMock.users.findUnique.mockResolvedValue({ id: 'user-1' });

      await expect(
        repo.updateGuestContact(
          'appt-1',
          {
            firstName: 'X',
            lastNamePaternal: 'Y',
            lastNameMaternal: null,
            phone: '70011122',
            email: 'ya@existe.com',
          },
          NOW,
        ),
      ).rejects.toThrow(GuestEmailBelongsToAccountError);
      expect(prismaMock.users.findUnique).toHaveBeenCalledWith({
        where: { email: 'ya@existe.com' },
      });
      expect(prismaMock.appointments.updateMany).not.toHaveBeenCalled();
    });

    it('throws GuestPhoneBelongsToAccountError when the phone already belongs to a user, without touching appointments', async () => {
      prismaMock.users.findFirst.mockResolvedValue({ id: 'user-1' });

      await expect(
        repo.updateGuestContact(
          'appt-1',
          {
            firstName: 'X',
            lastNamePaternal: 'Y',
            lastNameMaternal: null,
            phone: '70011122',
            email: null,
          },
          NOW,
        ),
      ).rejects.toThrow(GuestPhoneBelongsToAccountError);
      expect(prismaMock.users.findFirst).toHaveBeenCalledWith({
        where: { phone: '70011122' },
      });
      expect(prismaMock.appointments.updateMany).not.toHaveBeenCalled();
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

  it('findActiveBetween mapea las citas encontradas', async () => {
    prismaMock.appointments.findMany.mockResolvedValue([
      fakeAppointmentRecord(),
    ]);

    const result = await repo.findActiveBetween(NOW, NOW, NOW, 'doctor-1');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: fakeAppointmentRecord().id });
  });

  it('findById mapea la cita o devuelve null', async () => {
    prismaMock.appointments.findUnique
      .mockResolvedValueOnce(fakeAppointmentRecord())
      .mockResolvedValueOnce(null);

    await expect(repo.findById('appt-1')).resolves.toMatchObject({
      id: fakeAppointmentRecord().id,
    });
    await expect(repo.findById('missing')).resolves.toBeNull();
  });

  it('createHold propaga un error que no es de horario ocupado', async () => {
    const boom = new Error('connection lost');
    prismaMock.appointments.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.appointments.create.mockRejectedValue(boom);

    await expect(
      repo.createHold({
        doctorId: 'doctor-1',
        slot: SLOT,
        holdExpiresAt: NOW,
        treatmentId: null,
        durationMinutes: 30,
        source: 'public_web',
      }),
    ).rejects.toBe(boom);
  });

  it('updateGuestContact propaga un error que no es de teléfono duplicado', async () => {
    const boom = new Error('connection lost');
    prismaMock.appointments.updateMany.mockRejectedValue(boom);

    await expect(
      repo.updateGuestContact(
        'appt-1',
        {
          firstName: 'X',
          lastNamePaternal: 'Y',
          lastNameMaternal: null,
          phone: '7',
          email: null,
        },
        NOW,
      ),
    ).rejects.toBe(boom);
  });

  it('appendNote guarda la nota en la cita', async () => {
    const update = jest.fn().mockResolvedValue({});
    Object.assign(prismaMock.appointments, { update });

    await repo.appendNote('appt-1', 'Pago confirmado');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'appt-1' },
      data: { notes: 'Pago confirmado' },
    });
  });
});
