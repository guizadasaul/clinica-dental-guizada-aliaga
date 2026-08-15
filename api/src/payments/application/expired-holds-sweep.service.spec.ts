import { Test } from '@nestjs/testing';
import { ExpiredHoldsSweepService } from './expired-holds-sweep.service';
import { AppointmentRepository } from '../../appointments/domain/AppointmentRepository';
import { PaymentGateway } from '../domain/PaymentGateway';
import { Appointment, AppointmentStatus } from '../../appointments/domain/Appointment';

function fakeExpiredAppointment(id: string, qrId: string | null): Appointment {
  return new Appointment(
    id,
    null,
    null,
    null,
    new Date('2026-08-17T09:00:00.000Z'),
    AppointmentStatus.HELD,
    'public_web',
    'Guest Name',
    '70011122',
    null,
    new Date('2026-08-17T08:50:00.000Z'), // hold_expires_at, ya vencido
    null,
    new Date('2026-08-17T08:35:00.000Z'),
    qrId,
    null,
    'qr-image',
    50,
    null,
  );
}

const mockAppointmentRepo = {
  findActiveBetween: jest.fn(),
  findById: jest.fn(),
  findByQrId: jest.fn(),
  createHold: jest.fn(),
  updateGuestContact: jest.fn(),
  attachQr: jest.fn(),
  appendNote: jest.fn(),
  findForAgenda: jest.fn(),
  findExpiredHeldWithQr: jest.fn(),
  markExpired: jest.fn(),
};

const mockGateway = {
  generateQr: jest.fn(),
  getQrStatus: jest.fn(),
  cancelQr: jest.fn(),
};

describe('ExpiredHoldsSweepService', () => {
  let service: ExpiredHoldsSweepService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ExpiredHoldsSweepService,
        { provide: AppointmentRepository, useValue: mockAppointmentRepo },
        { provide: PaymentGateway, useValue: mockGateway },
      ],
    }).compile();
    service = module.get(ExpiredHoldsSweepService);
  });

  it('does nothing when there are no expired holds with a QR', async () => {
    mockAppointmentRepo.findExpiredHeldWithQr.mockResolvedValue([]);

    await service.sweep();

    expect(mockGateway.cancelQr).not.toHaveBeenCalled();
    expect(mockAppointmentRepo.markExpired).not.toHaveBeenCalled();
  });

  it('cancels the BANECO QR and marks the appointment expired', async () => {
    mockAppointmentRepo.findExpiredHeldWithQr.mockResolvedValue([
      fakeExpiredAppointment('appt-1', 'qr-1'),
    ]);
    mockGateway.cancelQr.mockResolvedValue(undefined);

    await service.sweep();

    expect(mockGateway.cancelQr).toHaveBeenCalledWith('qr-1');
    expect(mockAppointmentRepo.markExpired).toHaveBeenCalledWith('appt-1');
  });

  it('still marks the appointment expired even when cancelling the QR fails', async () => {
    mockAppointmentRepo.findExpiredHeldWithQr.mockResolvedValue([
      fakeExpiredAppointment('appt-1', 'qr-1'),
    ]);
    mockGateway.cancelQr.mockRejectedValue(new Error('BANECO caído'));

    await service.sweep();

    expect(mockAppointmentRepo.markExpired).toHaveBeenCalledWith('appt-1');
  });

  it('processes every expired appointment returned by the repository', async () => {
    mockAppointmentRepo.findExpiredHeldWithQr.mockResolvedValue([
      fakeExpiredAppointment('appt-1', 'qr-1'),
      fakeExpiredAppointment('appt-2', 'qr-2'),
    ]);
    mockGateway.cancelQr.mockResolvedValue(undefined);

    await service.sweep();

    expect(mockGateway.cancelQr).toHaveBeenCalledTimes(2);
    expect(mockAppointmentRepo.markExpired).toHaveBeenCalledTimes(2);
  });
});
