import { PrismaBookingConfirmationRepository } from './prisma-booking-confirmation.repository';
import { PrismaService } from '../../../shared/prisma/prisma.service';

const NOW = new Date('2026-08-17T13:05:00.000Z');

describe('PrismaBookingConfirmationRepository', () => {
  let prismaMock: {
    appointments: {
      updateMany: jest.Mock;
      update: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    users: { create: jest.Mock; findUnique: jest.Mock };
    patients: { create: jest.Mock; findUnique: jest.Mock };
    transaction: jest.Mock;
  };
  let repo: PrismaBookingConfirmationRepository;

  beforeEach(() => {
    prismaMock = {
      appointments: {
        updateMany: jest.fn(),
        update: jest.fn(),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ doctor_id: 'doctor-1' }),
      },
      users: { create: jest.fn(), findUnique: jest.fn() },
      patients: {
        create: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prismaMock)),
    };
    repo = new PrismaBookingConfirmationRepository(
      prismaMock as unknown as PrismaService,
    );
  });

  it('claims the hold with a conditional UPDATE (WHERE id AND status=held) before creating anything', async () => {
    prismaMock.appointments.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.users.create.mockResolvedValue({ id: 'user-1' });
    prismaMock.patients.create.mockResolvedValue({ id: 'patient-1' });

    const result = await repo.confirmPaidBooking({
      appointmentId: 'appt-1',
      paidAt: NOW,
      amount: 50,
      qrId: 'qr-1',
      guestFirstName: 'Juana',
      guestLastNamePaternal: 'Perez',
      guestLastNameMaternal: null,
      guestPhone: '70011122',
      guestEmail: null,
    });

    expect(prismaMock.appointments.updateMany).toHaveBeenCalledWith({
      where: { id: 'appt-1', status: 'held' },
      data: expect.objectContaining({
        status: 'confirmed',
        baneco_qr_id: 'qr-1',
      }) as Record<string, unknown>,
    });
    expect(result).toEqual({
      appointmentId: 'appt-1',
      patientId: 'patient-1',
      userId: 'user-1',
    });
  });

  it('is idempotent: a second call after the hold is already confirmed creates nothing', async () => {
    prismaMock.appointments.updateMany.mockResolvedValue({ count: 0 });

    const result = await repo.confirmPaidBooking({
      appointmentId: 'appt-1',
      paidAt: NOW,
      amount: 50,
      qrId: 'qr-1',
      guestFirstName: 'Juana',
      guestLastNamePaternal: 'Perez',
      guestLastNameMaternal: null,
      guestPhone: '70011122',
      guestEmail: null,
    });

    expect(result).toBeNull();
    expect(prismaMock.users.create).not.toHaveBeenCalled();
    expect(prismaMock.patients.create).not.toHaveBeenCalled();
  });

  // CLI-43: los tres campos atómicos se copian directo a Patient, sin
  // ninguna heurística de split — reemplaza los tests que antes fijaban el
  // comportamiento de splitGuestName() como si fuera correcto.
  it('copies the three atomic name fields straight to the Patient row, no heuristics involved', async () => {
    prismaMock.appointments.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.users.create.mockResolvedValue({ id: 'user-1' });
    prismaMock.patients.create.mockResolvedValue({ id: 'patient-1' });

    await repo.confirmPaidBooking({
      appointmentId: 'appt-1',
      paidAt: NOW,
      amount: 50,
      qrId: 'qr-1',
      guestFirstName: 'Maria',
      guestLastNamePaternal: 'Fernanda Lopez',
      guestLastNameMaternal: 'Gutierrez',
      guestPhone: '70011122',
      guestEmail: null,
    });

    expect(prismaMock.patients.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        first_name: 'Maria',
        last_name_paternal: 'Fernanda Lopez',
        last_name_maternal: 'Gutierrez',
        user_id: 'user-1',
      }) as Record<string, unknown>,
    });
  });

  it('does not invent a "-" placeholder when the guest gave no maternal surname', async () => {
    prismaMock.appointments.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.users.create.mockResolvedValue({ id: 'user-1' });
    prismaMock.patients.create.mockResolvedValue({ id: 'patient-1' });

    await repo.confirmPaidBooking({
      appointmentId: 'appt-1',
      paidAt: NOW,
      amount: 50,
      qrId: 'qr-1',
      guestFirstName: 'Juana',
      guestLastNamePaternal: 'Perez',
      guestLastNameMaternal: null,
      guestPhone: '70011122',
      guestEmail: null,
    });

    expect(prismaMock.patients.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        first_name: 'Juana',
        last_name_paternal: 'Perez',
        last_name_maternal: null,
      }) as Record<string, unknown>,
    });
  });

  it('creates the placeholder user with auth_user_id null and a display name composed from the three fields', async () => {
    prismaMock.appointments.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.users.create.mockResolvedValue({ id: 'user-1' });
    prismaMock.patients.create.mockResolvedValue({ id: 'patient-1' });

    await repo.confirmPaidBooking({
      appointmentId: 'appt-1',
      paidAt: NOW,
      amount: 50,
      qrId: 'qr-1',
      guestFirstName: 'Juana',
      guestLastNamePaternal: 'Perez',
      guestLastNameMaternal: 'Gomez',
      guestPhone: '70011122',
      guestEmail: null,
    });

    expect(prismaMock.users.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        auth_user_id: null,
        role: 'patient',
        display_name: 'Juana Perez Gomez',
      }) as Record<string, unknown>,
    });
    expect(prismaMock.appointments.update).toHaveBeenCalledWith({
      where: { id: 'appt-1' },
      data: { patient_id: 'patient-1' },
    });
  });

  // CLI-58: el doctor asignado a la ficha nueva es el de la cita que se
  // confirma, no un valor pasado por el caller — una sola fuente de verdad.
  it('assigns the confirmed appointment doctor_id to the new patient', async () => {
    prismaMock.appointments.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.appointments.findUniqueOrThrow.mockResolvedValue({
      doctor_id: 'doctor-b',
    });
    prismaMock.users.create.mockResolvedValue({ id: 'user-1' });
    prismaMock.patients.create.mockResolvedValue({ id: 'patient-1' });

    await repo.confirmPaidBooking({
      appointmentId: 'appt-1',
      paidAt: NOW,
      amount: 50,
      qrId: 'qr-1',
      guestFirstName: 'Juana',
      guestLastNamePaternal: 'Perez',
      guestLastNameMaternal: null,
      guestPhone: '70011122',
      guestEmail: null,
    });

    expect(prismaMock.appointments.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'appt-1' },
      select: { doctor_id: true },
    });
    expect(prismaMock.patients.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assigned_doctor_id: 'doctor-b',
      }) as Record<string, unknown>,
    });
  });

  it('does not touch assigned_doctor_id when reusing an existing patient', async () => {
    prismaMock.appointments.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.users.findUnique.mockResolvedValue({ id: 'existing-user' });
    prismaMock.patients.findUnique.mockResolvedValue({
      id: 'existing-patient',
    });

    await repo.confirmPaidBooking({
      appointmentId: 'appt-1',
      paidAt: NOW,
      amount: 50,
      qrId: 'qr-1',
      guestFirstName: 'Kevin',
      guestLastNamePaternal: 'Perez',
      guestLastNameMaternal: null,
      guestPhone: '70011122',
      guestEmail: 'ya@existe.com',
    });

    expect(prismaMock.patients.create).not.toHaveBeenCalled();
  });

  // El guest usó un email que ya es una cuenta existente (p. ej. ya se
  // registró antes, o reserva "para otra persona" con su propio email).
  // tx.users.create() pegaría contra el UNIQUE de email y, como Postgres
  // aborta toda la transacción ante un error, la cita quedaría trabada en
  // 'held' para siempre pese a estar pagada — hay que reusar el usuario y su
  // paciente existentes en vez de intentar crear otros.
  it('reuses the existing user and patient when the guest email already belongs to an account', async () => {
    prismaMock.appointments.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.users.findUnique.mockResolvedValue({ id: 'existing-user' });
    prismaMock.patients.findUnique.mockResolvedValue({
      id: 'existing-patient',
    });

    const result = await repo.confirmPaidBooking({
      appointmentId: 'appt-1',
      paidAt: NOW,
      amount: 50,
      qrId: 'qr-1',
      guestFirstName: 'Kevin',
      guestLastNamePaternal: 'Perez',
      guestLastNameMaternal: null,
      guestPhone: '70011122',
      guestEmail: 'ya@existe.com',
    });

    expect(prismaMock.users.findUnique).toHaveBeenCalledWith({
      where: { email: 'ya@existe.com' },
    });
    expect(prismaMock.users.create).not.toHaveBeenCalled();
    expect(prismaMock.patients.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      appointmentId: 'appt-1',
      patientId: 'existing-patient',
      userId: 'existing-user',
    });
  });
});
