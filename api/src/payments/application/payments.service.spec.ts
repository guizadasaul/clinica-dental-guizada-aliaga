import {
  ConflictException,
  GoneException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { PaymentGateway, QrStatus } from '../domain/PaymentGateway';
import { BookingConfirmationRepository } from '../domain/BookingConfirmationRepository';
import { AppointmentRepository } from '../../appointments/domain/AppointmentRepository';
import {
  Appointment,
  AppointmentStatus,
} from '../../appointments/domain/Appointment';
import { TreatmentRepository } from '../../treatments/domain/TreatmentRepository';
import type { Treatment } from '../../treatments/domain/Treatment';

const mockGateway = {
  generateQr: jest.fn(),
  getQrStatus: jest.fn(),
};

const mockAppointmentRepo = {
  findActiveBetween: jest.fn(),
  findById: jest.fn(),
  findByQrId: jest.fn(),
  createHold: jest.fn(),
  updateGuestContact: jest.fn(),
  attachQr: jest.fn(),
  appendNote: jest.fn(),
};

const mockTreatmentRepo = {
  findActive: jest.fn(),
  findDefaultConsultation: jest.fn(),
};

const mockConfirmationRepo = {
  confirmPaidBooking: jest.fn(),
};

const CONSULTATION: Treatment = {
  id: 'treat-1',
  name: 'Consulta inicial',
  description: null,
  basePrice: 50,
  estimatedMinutes: 30,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

interface FakeAppointmentOptions {
  status?: string;
  holdExpiresAt?: Date | null;
  banecoQrId?: string | null;
  banecoQrImage?: string | null;
  paymentAmount?: number | null;
  guestFullName?: string | null;
  guestPhone?: string | null;
}

function fakeAppointment(options: FakeAppointmentOptions = {}): Appointment {
  return new Appointment(
    'appt-1',
    null,
    null,
    null,
    new Date('2026-08-17T13:00:00.000Z'),
    options.status ?? AppointmentStatus.HELD,
    'public_web',
    options.guestFullName ?? 'Juana Perez',
    options.guestPhone ?? '70011122',
    options.holdExpiresAt !== undefined
      ? options.holdExpiresAt
      : new Date(Date.now() + 15 * 60 * 1000),
    null,
    new Date(),
    options.banecoQrId ?? null,
    null,
    options.banecoQrImage ?? null,
    options.paymentAmount ?? null,
    null,
  );
}

describe('PaymentsService', () => {
  let service: PaymentsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PaymentGateway, useValue: mockGateway },
        { provide: AppointmentRepository, useValue: mockAppointmentRepo },
        { provide: TreatmentRepository, useValue: mockTreatmentRepo },
        {
          provide: BookingConfirmationRepository,
          useValue: mockConfirmationRepo,
        },
      ],
    }).compile();
    service = module.get(PaymentsService);
  });

  describe('checkout', () => {
    it('throws NotFoundException when the appointment does not exist', async () => {
      mockAppointmentRepo.findById.mockResolvedValue(null);

      await expect(service.checkout('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException when the appointment is not held', async () => {
      mockAppointmentRepo.findById.mockResolvedValue(
        fakeAppointment({ status: AppointmentStatus.CONFIRMED }),
      );

      await expect(service.checkout('appt-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws GoneException when the hold already expired', async () => {
      mockAppointmentRepo.findById.mockResolvedValue(
        fakeAppointment({ holdExpiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(service.checkout('appt-1')).rejects.toThrow(GoneException);
    });

    it('is idempotent: returns the stored QR without calling BANECO again', async () => {
      mockAppointmentRepo.findById.mockResolvedValue(
        fakeAppointment({
          banecoQrId: 'qr-1',
          banecoQrImage: 'base64img',
          paymentAmount: 50,
        }),
      );

      const result = await service.checkout('appt-1');

      expect(result).toEqual(
        expect.objectContaining({
          qrId: 'qr-1',
          qrImageBase64: 'base64img',
          amount: 50,
        }),
      );
      expect(mockGateway.generateQr).not.toHaveBeenCalled();
    });

    it('throws ServiceUnavailableException when no default-consultation treatment is configured', async () => {
      mockAppointmentRepo.findById.mockResolvedValue(fakeAppointment());
      mockTreatmentRepo.findDefaultConsultation.mockResolvedValue(null);

      await expect(service.checkout('appt-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(mockGateway.generateQr).not.toHaveBeenCalled();
    });

    it('generates a QR and attaches it to the hold on the happy path', async () => {
      mockAppointmentRepo.findById.mockResolvedValue(fakeAppointment());
      mockTreatmentRepo.findDefaultConsultation.mockResolvedValue(CONSULTATION);
      mockGateway.generateQr.mockResolvedValue({
        qrId: 'qr-new',
        qrImageBase64: 'img',
      });
      mockAppointmentRepo.attachQr.mockResolvedValue(
        fakeAppointment({
          banecoQrId: 'qr-new',
          banecoQrImage: 'img',
          paymentAmount: 50,
        }),
      );

      const result = await service.checkout('appt-1');

      expect(mockGateway.generateQr).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 50 }),
      );
      expect(mockAppointmentRepo.attachQr).toHaveBeenCalledWith('appt-1', {
        qrId: 'qr-new',
        qrImage: 'img',
        amount: 50,
      });
      expect(result.qrId).toBe('qr-new');
    });

    it('throws GoneException when the hold expires between reading it and attaching the QR', async () => {
      mockAppointmentRepo.findById.mockResolvedValue(fakeAppointment());
      mockTreatmentRepo.findDefaultConsultation.mockResolvedValue(CONSULTATION);
      mockGateway.generateQr.mockResolvedValue({
        qrId: 'qr-new',
        qrImageBase64: 'img',
      });
      mockAppointmentRepo.attachQr.mockResolvedValue(null);

      await expect(service.checkout('appt-1')).rejects.toThrow(GoneException);
    });
  });

  describe('handleBanecoNotification (webhook)', () => {
    it('is a no-op when the qrId is unknown', async () => {
      mockAppointmentRepo.findByQrId.mockResolvedValue(null);

      await service.handleBanecoNotification('unknown-qr');

      expect(mockGateway.getQrStatus).not.toHaveBeenCalled();
    });

    it('does not confirm when BANECO reports the QR as still pending', async () => {
      mockAppointmentRepo.findByQrId.mockResolvedValue(
        fakeAppointment({ banecoQrId: 'qr-1' }),
      );
      mockGateway.getQrStatus.mockResolvedValue({
        status: QrStatus.PENDING,
        payment: null,
      });

      await service.handleBanecoNotification('qr-1');

      expect(mockConfirmationRepo.confirmPaidBooking).not.toHaveBeenCalled();
    });

    it('confirms the booking exactly once when BANECO reports PAID and the hold is still active', async () => {
      mockAppointmentRepo.findByQrId.mockResolvedValue(
        fakeAppointment({ banecoQrId: 'qr-1', paymentAmount: 50 }),
      );
      mockGateway.getQrStatus.mockResolvedValue({
        status: QrStatus.PAID,
        payment: {
          qrId: 'qr-1',
          transactionId: 't1',
          amount: 50,
          currency: 'BOB',
          paidAt: new Date(),
          senderName: 'X',
        },
      });
      mockConfirmationRepo.confirmPaidBooking.mockResolvedValue({
        appointmentId: 'appt-1',
        patientId: 'patient-1',
        userId: 'user-1',
      });

      await service.handleBanecoNotification('qr-1');

      expect(mockConfirmationRepo.confirmPaidBooking).toHaveBeenCalledTimes(1);
      expect(mockConfirmationRepo.confirmPaidBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentId: 'appt-1',
          qrId: 'qr-1',
          guestFullName: 'Juana Perez',
        }),
      );
    });

    it('does not throw when a duplicate webhook finds the booking already confirmed', async () => {
      mockAppointmentRepo.findByQrId.mockResolvedValue(
        fakeAppointment({ banecoQrId: 'qr-1' }),
      );
      mockGateway.getQrStatus.mockResolvedValue({
        status: QrStatus.PAID,
        payment: null,
      });
      mockConfirmationRepo.confirmPaidBooking.mockResolvedValue(null);

      await expect(
        service.handleBanecoNotification('qr-1'),
      ).resolves.toBeUndefined();
    });

    it('flags for manual review and does NOT create User/Patient when paid after the hold expired', async () => {
      mockAppointmentRepo.findByQrId.mockResolvedValue(
        fakeAppointment({
          banecoQrId: 'qr-1',
          holdExpiresAt: new Date(Date.now() - 1000),
        }),
      );
      mockGateway.getQrStatus.mockResolvedValue({
        status: QrStatus.PAID,
        payment: null,
      });

      await service.handleBanecoNotification('qr-1');

      expect(mockConfirmationRepo.confirmPaidBooking).not.toHaveBeenCalled();
      expect(mockAppointmentRepo.appendNote).toHaveBeenCalledWith(
        'appt-1',
        'PAGO_TARDIO_REVISAR',
      );
    });
  });

  describe('getPublicStatus', () => {
    it('throws NotFoundException when the appointment does not exist', async () => {
      mockAppointmentRepo.findById.mockResolvedValue(null);

      await expect(service.getPublicStatus('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('re-verifies against BANECO while still held with a QR, and reports paid after confirmation', async () => {
      mockAppointmentRepo.findById
        .mockResolvedValueOnce(fakeAppointment({ banecoQrId: 'qr-1' }))
        .mockResolvedValueOnce(
          fakeAppointment({
            status: AppointmentStatus.CONFIRMED,
            banecoQrId: 'qr-1',
          }),
        );
      mockGateway.getQrStatus.mockResolvedValue({
        status: QrStatus.PAID,
        payment: null,
      });
      mockConfirmationRepo.confirmPaidBooking.mockResolvedValue({
        appointmentId: 'appt-1',
        patientId: 'patient-1',
        userId: 'user-1',
      });

      const result = await service.getPublicStatus('appt-1');

      expect(mockGateway.getQrStatus).toHaveBeenCalledWith('qr-1');
      expect(result.paid).toBe(true);
      expect(result.status).toBe(AppointmentStatus.CONFIRMED);
    });

    it('does not call BANECO when the appointment has no QR yet', async () => {
      mockAppointmentRepo.findById.mockResolvedValue(
        fakeAppointment({ banecoQrId: null }),
      );

      const result = await service.getPublicStatus('appt-1');

      expect(mockGateway.getQrStatus).not.toHaveBeenCalled();
      expect(result.paid).toBe(false);
    });
  });
});
