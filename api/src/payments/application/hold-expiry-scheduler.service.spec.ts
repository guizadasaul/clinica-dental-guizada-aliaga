import { SchedulerRegistry } from '@nestjs/schedule';
import { HoldExpiryScheduler } from './hold-expiry-scheduler.service';
import {
  Appointment,
  AppointmentStatus,
} from '../../appointments/domain/Appointment';

function fakeAppointment(
  id: string,
  status: string,
  qrId: string | null,
  holdExpiresAt: Date | null,
): Appointment {
  return new Appointment(
    id,
    null,
    null,
    new Date('2026-08-17T09:00:00.000Z'),
    30,
    status,
    'public_web',
    'Guest',
    'Name',
    null,
    '70011122',
    null,
    holdExpiresAt,
    null,
    new Date('2026-08-17T08:35:00.000Z'),
    qrId,
    null,
    qrId ? 'qr-image' : null,
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
  findHeldWithQr: jest.fn(),
  markExpired: jest.fn(),
};

const mockGateway = {
  generateQr: jest.fn(),
  getQrStatus: jest.fn(),
  cancelQr: jest.fn(),
};

describe('HoldExpiryScheduler', () => {
  let schedulerRegistry: SchedulerRegistry;
  let service: HoldExpiryScheduler;

  beforeEach(() => {
    jest.resetAllMocks();
    mockGateway.cancelQr.mockResolvedValue(undefined);
    jest.useFakeTimers();
    schedulerRegistry = new SchedulerRegistry();
    service = new HoldExpiryScheduler(
      mockAppointmentRepo,
      mockGateway,
      schedulerRegistry,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('scheduleExpiry', () => {
    it('cancels the QR and marks the appointment expired exactly when the hold expires — not before', async () => {
      mockAppointmentRepo.findById.mockResolvedValue(
        fakeAppointment(
          'appt-1',
          AppointmentStatus.HELD,
          'qr-1',
          new Date(Date.now() + 10 * 60 * 1000),
        ),
      );
      mockGateway.cancelQr.mockResolvedValue(undefined);

      service.scheduleExpiry('appt-1', new Date(Date.now() + 10 * 60 * 1000));

      // Un segundo antes de vencer: todavía nada.
      await jest.advanceTimersByTimeAsync(10 * 60 * 1000 - 1000);
      expect(mockGateway.cancelQr).not.toHaveBeenCalled();

      // Exactamente al vencer.
      await jest.advanceTimersByTimeAsync(1000);
      expect(mockGateway.cancelQr).toHaveBeenCalledWith('qr-1');
      expect(mockAppointmentRepo.markExpired).toHaveBeenCalledWith('appt-1');
    });

    it('does nothing if the appointment was already confirmed before the timer fired', async () => {
      mockAppointmentRepo.findById.mockResolvedValue(
        fakeAppointment('appt-1', AppointmentStatus.CONFIRMED, 'qr-1', null),
      );

      service.scheduleExpiry('appt-1', new Date(Date.now() + 1000));
      await jest.advanceTimersByTimeAsync(1000);

      expect(mockGateway.cancelQr).not.toHaveBeenCalled();
      expect(mockAppointmentRepo.markExpired).not.toHaveBeenCalled();
    });

    it('still marks the appointment expired even when BANECO fails to cancel the QR', async () => {
      mockAppointmentRepo.findById.mockResolvedValue(
        fakeAppointment(
          'appt-1',
          AppointmentStatus.HELD,
          'qr-1',
          new Date(Date.now() + 1000),
        ),
      );
      mockGateway.cancelQr.mockRejectedValue(new Error('BANECO caído'));

      service.scheduleExpiry('appt-1', new Date(Date.now() + 1000));
      await jest.advanceTimersByTimeAsync(1000);

      expect(mockAppointmentRepo.markExpired).toHaveBeenCalledWith('appt-1');
    });

    it('fires immediately (no delay) when holdExpiresAt is already in the past', async () => {
      mockAppointmentRepo.findById.mockResolvedValue(
        fakeAppointment(
          'appt-1',
          AppointmentStatus.HELD,
          'qr-1',
          new Date(Date.now() - 60 * 1000),
        ),
      );

      service.scheduleExpiry('appt-1', new Date(Date.now() - 60 * 1000));
      await jest.advanceTimersByTimeAsync(0);

      expect(mockAppointmentRepo.markExpired).toHaveBeenCalledWith('appt-1');
    });

    it('replaces a previously scheduled timer for the same appointment instead of throwing', async () => {
      mockAppointmentRepo.findById.mockResolvedValue(
        fakeAppointment(
          'appt-1',
          AppointmentStatus.HELD,
          'qr-1',
          new Date(Date.now() + 5000),
        ),
      );

      service.scheduleExpiry('appt-1', new Date(Date.now() + 1000));
      expect(() =>
        service.scheduleExpiry('appt-1', new Date(Date.now() + 5000)),
      ).not.toThrow();

      // El primer timer (1s) no debería haber quedado vivo y disparado antes de tiempo.
      await jest.advanceTimersByTimeAsync(1000);
      expect(mockAppointmentRepo.markExpired).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(4000);
      expect(mockAppointmentRepo.markExpired).toHaveBeenCalledWith('appt-1');
    });
  });

  describe('onApplicationBootstrap', () => {
    it('reschedules a precise timer for every held appointment with a QR found at boot', async () => {
      mockAppointmentRepo.findHeldWithQr.mockResolvedValue([
        fakeAppointment(
          'appt-1',
          AppointmentStatus.HELD,
          'qr-1',
          new Date(Date.now() + 2000),
        ),
      ]);
      mockAppointmentRepo.findById.mockResolvedValue(
        fakeAppointment(
          'appt-1',
          AppointmentStatus.HELD,
          'qr-1',
          new Date(Date.now() + 2000),
        ),
      );

      await service.onApplicationBootstrap();
      await jest.advanceTimersByTimeAsync(2000);

      expect(mockAppointmentRepo.markExpired).toHaveBeenCalledWith('appt-1');
    });
  });
});
