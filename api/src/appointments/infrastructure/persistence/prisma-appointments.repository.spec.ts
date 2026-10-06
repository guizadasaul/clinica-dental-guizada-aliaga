import { Prisma } from '@prisma/client';
import { PrismaAppointmentsRepository } from './prisma-appointments.repository';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  GuestEmailBelongsToAccountError,
  GuestPhoneBelongsToAccountError,
  GuestPhoneConflictError,
  PatientNotFoundError,
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
      findFirst: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
    };
    users: { findUnique: jest.Mock; findFirst: jest.Mock };
    patients: { findUnique: jest.Mock };
    transaction: jest.Mock;
  };
  let repo: PrismaAppointmentsRepository;

  beforeEach(() => {
    prismaMock = {
      appointments: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
      users: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      patients: { findUnique: jest.fn() },
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
    it('trae solo citas confirmadas (o attended) de ESE paciente, con doctor y tratamiento', async () => {
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
          status: { in: ['confirmed', 'attended'] },
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
          status: 'confirmed',
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

    it('con includeNoShow suma las "No asistió" y sin limit trae todas (CLI-209)', async () => {
      prismaMock.appointments.findMany.mockResolvedValue([]);

      await repo.findForPatient('patient-1', {
        order: 'desc',
        includeNoShow: true,
      });

      const args = (
        prismaMock.appointments.findMany.mock.calls as unknown[][]
      )[0][0] as { where: Record<string, unknown>; take?: number };
      expect(args.where.status).toEqual({
        in: ['confirmed', 'attended', 'no_show'],
      });
      expect(args.take).toBeUndefined();
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
        durationMinutes: 30,
        source: 'public_web',
        treatmentName: null,
      });
    });
  });

  // CLI-148
  describe('createByDoctor', () => {
    const data = {
      doctorId: 'doctor-1',
      patientId: 'patient-1',
      treatmentId: 'treatment-1',
      appointmentDatetime: SLOT,
      durationMinutes: 60,
      notes: 'control',
    };

    it('crea la cita confirmada, con source doctor y sin datos de pago ni de invitado', async () => {
      prismaMock.patients.findUnique.mockResolvedValue({ id: 'patient-1' });
      prismaMock.appointments.create.mockResolvedValue(
        fakeAppointmentRecord({
          status: 'confirmed',
          source: 'doctor',
          hold_expires_at: null,
          patient_id: 'patient-1',
          treatment_id: 'treatment-1',
          duration_minutes: 60,
          notes: 'control',
          doctor_id: 'doctor-1',
          patients: {
            first_name: 'Ana',
            last_name_paternal: 'Pérez',
            users: { phone: '+59170000000', email: null },
          },
          users: { display_name: 'Dr. Saul', doctor_profiles: null },
          treatments: { name: 'Control de ortodoncia' },
        }),
      );

      const result = await repo.createByDoctor(data);

      expect(prismaMock.appointments.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            doctor_id: 'doctor-1',
            patient_id: 'patient-1',
            treatment_id: 'treatment-1',
            appointment_datetime: SLOT,
            duration_minutes: 60,
            status: 'confirmed',
            source: 'doctor',
            notes: 'control',
          },
        }),
      );
      expect(result).toMatchObject({
        status: 'confirmed',
        source: 'doctor',
        patientFirstName: 'Ana',
        durationMinutes: 60,
        treatmentName: 'Control de ortodoncia',
        notes: 'control',
      });
    });

    it('lanza PatientNotFoundError sin crear nada si el paciente no existe', async () => {
      prismaMock.patients.findUnique.mockResolvedValue(null);

      await expect(repo.createByDoctor(data)).rejects.toBeInstanceOf(
        PatientNotFoundError,
      );
      expect(prismaMock.appointments.create).not.toHaveBeenCalled();
    });

    it('traduce el choque en el índice único (P2002) a SlotUnavailableError', async () => {
      prismaMock.patients.findUnique.mockResolvedValue({ id: 'patient-1' });
      prismaMock.appointments.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(repo.createByDoctor(data)).rejects.toBeInstanceOf(
        SlotUnavailableError,
      );
    });
  });

  // CLI-149
  describe('findForDoctor', () => {
    it('busca la cita solo dentro de la agenda de ese doctor', async () => {
      prismaMock.appointments.findFirst.mockResolvedValue(null);

      await expect(
        repo.findForDoctor('appt-1', 'doctor-1'),
      ).resolves.toBeNull();
      expect(prismaMock.appointments.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'appt-1', doctor_id: 'doctor-1' },
        }),
      );
    });
  });

  describe('reschedule', () => {
    const agendaRecord = () =>
      fakeAppointmentRecord({
        status: 'confirmed',
        doctor_id: 'doctor-1',
        patients: null,
        users: { display_name: 'Dr. Saul', doctor_profiles: null },
        treatments: null,
      });

    it('actualiza solo si sigue confirmada y es de ese doctor, sin tocar notas si no vienen', async () => {
      prismaMock.appointments.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.appointments.findFirst.mockResolvedValue(agendaRecord());

      const result = await repo.reschedule('appt-1', 'doctor-1', {
        appointmentDatetime: SLOT,
        durationMinutes: 60,
      });

      expect(prismaMock.appointments.updateMany).toHaveBeenCalledWith({
        where: { id: 'appt-1', doctor_id: 'doctor-1', status: 'confirmed' },
        data: { appointment_datetime: SLOT, duration_minutes: 60 },
      });
      expect(result).toMatchObject({ id: 'appt-1', status: 'confirmed' });
    });

    it('escribe las notas cuando vienen (null las borra)', async () => {
      prismaMock.appointments.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.appointments.findFirst.mockResolvedValue(agendaRecord());

      await repo.reschedule('appt-1', 'doctor-1', {
        appointmentDatetime: SLOT,
        durationMinutes: 30,
        notes: null,
      });

      expect(prismaMock.appointments.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ notes: null }) as unknown,
        }),
      );
    });

    it('devuelve null sin releer si ya no estaba confirmada', async () => {
      prismaMock.appointments.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        repo.reschedule('appt-1', 'doctor-1', {
          appointmentDatetime: SLOT,
          durationMinutes: 30,
        }),
      ).resolves.toBeNull();
      expect(prismaMock.appointments.findFirst).not.toHaveBeenCalled();
    });

    it('traduce P2002 a SlotUnavailableError', async () => {
      prismaMock.appointments.updateMany.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        repo.reschedule('appt-1', 'doctor-1', {
          appointmentDatetime: SLOT,
          durationMinutes: 30,
        }),
      ).rejects.toBeInstanceOf(SlotUnavailableError);
    });
  });

  describe('cancel', () => {
    it('pasa a cancelled con quién, cuándo y el motivo en su propia columna (CLI-103)', async () => {
      prismaMock.appointments.findFirst.mockResolvedValueOnce(
        fakeAppointmentRecord({
          status: 'cancelled',
          cancelled_at: NOW,
          cancel_reason: 'no puede venir',
          doctor_id: 'doctor-1',
          patients: null,
          users: { display_name: 'Dr. Saul', doctor_profiles: null },
          treatments: null,
          cancelled_by_user: { display_name: 'Dr. Saul' },
        }),
      );
      prismaMock.appointments.updateMany.mockResolvedValue({ count: 1 });

      const result = await repo.cancel(
        'appt-1',
        'doctor-1',
        'doctor-1',
        'no puede venir',
      );

      const call = (
        prismaMock.appointments.updateMany.mock.calls as unknown[][]
      )[0][0] as {
        where: unknown;
        data: Record<string, unknown>;
      };
      expect(call.where).toEqual({
        id: 'appt-1',
        doctor_id: 'doctor-1',
        status: 'confirmed',
      });
      expect(call.data).toMatchObject({
        status: 'cancelled',
        cancelled_by: 'doctor-1',
        cancel_reason: 'no puede venir',
      });
      // Las notas del turno no se tocan.
      expect(call.data).not.toHaveProperty('notes');
      expect(call.data.cancelled_at).toBeInstanceOf(Date);
      expect(result).toMatchObject({
        status: 'cancelled',
        cancelledAt: NOW,
        cancelReason: 'no puede venir',
        cancelledByName: 'Dr. Saul',
      });
    });

    it('sin motivo guarda cancel_reason en null', async () => {
      prismaMock.appointments.findFirst.mockResolvedValueOnce(null);
      prismaMock.appointments.updateMany.mockResolvedValue({ count: 1 });

      await repo.cancel('appt-1', 'doctor-1', 'doctor-1', null);

      expect(prismaMock.appointments.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ cancel_reason: null }) as unknown,
        }),
      );
    });

    it('devuelve null si ya no estaba confirmada (no se actualizó nada)', async () => {
      prismaMock.appointments.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        repo.cancel('appt-1', 'doctor-1', 'doctor-1', null),
      ).resolves.toBeNull();
      expect(prismaMock.appointments.findFirst).not.toHaveBeenCalled();
    });
  });

  // CLI-208
  describe('setAttendance', () => {
    it('mueve el estado solo si la cita del doctor está en `from`', async () => {
      prismaMock.appointments.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.appointments.findFirst.mockResolvedValueOnce(
        fakeAppointmentRecord({
          status: 'no_show',
          doctor_id: 'doctor-1',
          patients: null,
          users: { display_name: 'Dr. Saul', doctor_profiles: null },
          treatments: null,
          cancelled_by_user: null,
        }),
      );

      const result = await repo.setAttendance(
        'appt-1',
        'doctor-1',
        'confirmed',
        'no_show',
      );

      expect(prismaMock.appointments.updateMany).toHaveBeenCalledWith({
        where: { id: 'appt-1', doctor_id: 'doctor-1', status: 'confirmed' },
        data: { status: 'no_show' },
      });
      expect(result).toMatchObject({ status: 'no_show' });
    });

    it('null si ya no estaba en `from`', async () => {
      prismaMock.appointments.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        repo.setAttendance('appt-1', 'doctor-1', 'no_show', 'confirmed'),
      ).resolves.toBeNull();
      expect(prismaMock.appointments.findFirst).not.toHaveBeenCalled();
    });

    it('traduce el choque del índice único a SlotUnavailableError', async () => {
      prismaMock.appointments.updateMany.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        repo.setAttendance('appt-1', 'doctor-1', 'no_show', 'confirmed'),
      ).rejects.toThrow(SlotUnavailableError);
    });

    it('propaga cualquier otro error', async () => {
      prismaMock.appointments.updateMany.mockRejectedValue(new Error('boom'));

      await expect(
        repo.setAttendance('appt-1', 'doctor-1', 'confirmed', 'no_show'),
      ).rejects.toThrow('boom');
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

    // CLI-149: una cita cancelada libera el turno para la reserva pública y
    // para agendar — solo cuentan confirmed y held vigentes.
    it('solo cuenta citas confirmadas y holds vigentes (no canceladas)', async () => {
      prismaMock.appointments.findMany.mockResolvedValue([]);

      await repo.findActiveBetween(SLOT, SLOT, NOW, 'doctor-1');

      const { where } = (
        prismaMock.appointments.findMany.mock.calls as unknown[][]
      )[0][0] as { where: { OR: unknown } };
      expect(where.OR).toEqual([
        { status: 'confirmed' },
        { status: 'held', hold_expires_at: { gt: NOW } },
      ]);
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
      prismaMock.users.findFirst.mockResolvedValue({ id: 'user-1' });

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
      expect(prismaMock.users.findFirst).toHaveBeenCalledWith({
        where: { email: 'ya@existe.com', is_active: true },
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
        where: { phone: '70011122', is_active: true },
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
