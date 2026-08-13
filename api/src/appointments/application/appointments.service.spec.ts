import {
  BadRequestException,
  ConflictException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppointmentsService } from './appointments.service';
import {
  AppointmentRepository,
  SlotUnavailableError,
} from '../domain/AppointmentRepository';
import { Appointment, AppointmentStatus } from '../domain/Appointment';

const MONDAY = '2026-08-17';
const VALID_SLOT_ISO = `${MONDAY}T09:00:00-04:00`;

const mockRepo = {
  findActiveBetween: jest.fn(),
  findById: jest.fn(),
  findByQrId: jest.fn(),
  createHold: jest.fn(),
  updateGuestContact: jest.fn(),
  attachQr: jest.fn(),
  appendNote: jest.fn(),
};

interface FakeAppointmentOptions {
  slot?: Date;
  status?: string;
}

function fakeAppointment(options: FakeAppointmentOptions = {}): Appointment {
  return new Appointment(
    'appt-1',
    null,
    null,
    null,
    options.slot ?? new Date(VALID_SLOT_ISO),
    options.status ?? AppointmentStatus.HELD,
    'public_web',
    null,
    null,
    new Date(Date.now() + 15 * 60 * 1000),
    null,
    new Date(),
    null,
    null,
    null,
    null,
    null,
  );
}

describe('AppointmentsService', () => {
  let service: AppointmentsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: AppointmentRepository, useValue: mockRepo },
      ],
    }).compile();
    service = module.get(AppointmentsService);
  });

  describe('getAvailability', () => {
    it('returns no slots and never queries the repo on a closed day (Sunday)', async () => {
      const result = await service.getAvailability('2026-08-16');

      expect(result.slots).toHaveLength(0);
      expect(mockRepo.findActiveBetween).not.toHaveBeenCalled();
    });

    it('excludes a slot that already has an active appointment', async () => {
      const taken = fakeAppointment({ slot: new Date(VALID_SLOT_ISO) });
      mockRepo.findActiveBetween.mockResolvedValue([taken]);

      const result = await service.getAvailability(MONDAY);

      expect(result.slots).not.toContain(
        new Date(VALID_SLOT_ISO).toISOString(),
      );
      expect(result.slots.length).toBeGreaterThan(0);
    });
  });

  describe('holdSlot', () => {
    it('rejects an off-grid slot without touching the repo', async () => {
      await expect(
        service.holdSlot(`${MONDAY}T09:15:00-04:00`),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.createHold).not.toHaveBeenCalled();
    });

    it('rejects a slot in the past without touching the repo', async () => {
      await expect(
        service.holdSlot('2020-01-06T09:00:00-04:00'),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.createHold).not.toHaveBeenCalled();
    });

    it('maps SlotUnavailableError to ConflictException (409)', async () => {
      mockRepo.createHold.mockRejectedValue(new SlotUnavailableError());

      await expect(service.holdSlot(VALID_SLOT_ISO)).rejects.toThrow(
        ConflictException,
      );
    });

    it('returns the created hold on success', async () => {
      mockRepo.createHold.mockResolvedValue(fakeAppointment());

      const result = await service.holdSlot(VALID_SLOT_ISO);

      expect(result.appointmentId).toBe('appt-1');
      expect(mockRepo.createHold).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'public_web', treatmentId: null }),
      );
    });
  });

  describe('saveGuestContact', () => {
    it('returns the updated appointment when the hold is still active', async () => {
      mockRepo.updateGuestContact.mockResolvedValue(fakeAppointment());

      const result = await service.saveGuestContact(
        'appt-1',
        'Juana Perez',
        '70011122',
      );

      expect(result.id).toBe('appt-1');
    });

    it('throws NotFoundException when the appointment does not exist at all', async () => {
      mockRepo.updateGuestContact.mockResolvedValue(null);
      mockRepo.findById.mockResolvedValue(null);

      await expect(
        service.saveGuestContact('missing', 'Juana Perez', '70011122'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws GoneException (410) when the hold existed but already expired', async () => {
      mockRepo.updateGuestContact.mockResolvedValue(null);
      mockRepo.findById.mockResolvedValue(
        fakeAppointment({ status: AppointmentStatus.EXPIRED }),
      );

      await expect(
        service.saveGuestContact('appt-1', 'Juana Perez', '70011122'),
      ).rejects.toThrow(GoneException);
    });
  });
});
