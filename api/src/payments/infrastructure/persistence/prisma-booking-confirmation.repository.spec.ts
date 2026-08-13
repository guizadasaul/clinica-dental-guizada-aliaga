import { PrismaBookingConfirmationRepository } from './prisma-booking-confirmation.repository';
import { PrismaService } from '../../../shared/prisma/prisma.service';

const NOW = new Date('2026-08-17T13:05:00.000Z');

describe('PrismaBookingConfirmationRepository', () => {
  let prismaMock: {
    appointments: { updateMany: jest.Mock; update: jest.Mock };
    users: { create: jest.Mock };
    patients: { create: jest.Mock };
    transaction: jest.Mock;
  };
  let repo: PrismaBookingConfirmationRepository;

  beforeEach(() => {
    prismaMock = {
      appointments: { updateMany: jest.fn(), update: jest.fn() },
      users: { create: jest.fn() },
      patients: { create: jest.fn() },
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
      guestFullName: 'Juana Perez',
      guestPhone: '70011122',
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
      guestFullName: 'Juana Perez',
      guestPhone: '70011122',
    });

    expect(result).toBeNull();
    expect(prismaMock.users.create).not.toHaveBeenCalled();
    expect(prismaMock.patients.create).not.toHaveBeenCalled();
  });

  it('splits the guest full name into first_name/last_name_paternal for the Patient row', async () => {
    prismaMock.appointments.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.users.create.mockResolvedValue({ id: 'user-1' });
    prismaMock.patients.create.mockResolvedValue({ id: 'patient-1' });

    await repo.confirmPaidBooking({
      appointmentId: 'appt-1',
      paidAt: NOW,
      amount: 50,
      qrId: 'qr-1',
      guestFullName: 'Maria Fernanda Lopez',
      guestPhone: '70011122',
    });

    expect(prismaMock.patients.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        first_name: 'Maria',
        last_name_paternal: 'Fernanda Lopez',
        user_id: 'user-1',
      }) as Record<string, unknown>,
    });
  });

  it('falls back to "-" for last_name_paternal when the guest gave a single-word name', async () => {
    prismaMock.appointments.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.users.create.mockResolvedValue({ id: 'user-1' });
    prismaMock.patients.create.mockResolvedValue({ id: 'patient-1' });

    await repo.confirmPaidBooking({
      appointmentId: 'appt-1',
      paidAt: NOW,
      amount: 50,
      qrId: 'qr-1',
      guestFullName: 'Juana',
      guestPhone: '70011122',
    });

    expect(prismaMock.patients.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        first_name: 'Juana',
        last_name_paternal: '-',
      }) as Record<string, unknown>,
    });
  });

  it('creates the placeholder user with auth_user_id null', async () => {
    prismaMock.appointments.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.users.create.mockResolvedValue({ id: 'user-1' });
    prismaMock.patients.create.mockResolvedValue({ id: 'patient-1' });

    await repo.confirmPaidBooking({
      appointmentId: 'appt-1',
      paidAt: NOW,
      amount: 50,
      qrId: 'qr-1',
      guestFullName: 'Juana Perez',
      guestPhone: '70011122',
    });

    expect(prismaMock.users.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        auth_user_id: null,
        role: 'patient',
      }) as Record<string, unknown>,
    });
    expect(prismaMock.appointments.update).toHaveBeenCalledWith({
      where: { id: 'appt-1' },
      data: { patient_id: 'patient-1' },
    });
  });
});
