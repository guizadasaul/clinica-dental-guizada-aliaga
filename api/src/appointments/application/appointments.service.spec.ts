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
  GuestPhoneConflictError,
  SlotUnavailableError,
} from '../domain/AppointmentRepository';
import { Appointment, AppointmentStatus } from '../domain/Appointment';
import { TreatmentRepository } from '../../treatments/domain/TreatmentRepository';
import type { Treatment } from '../../treatments/domain/Treatment';

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
  findForAgenda: jest.fn(),
};

const mockTreatmentRepo = {
  findActive: jest.fn(),
  findById: jest.fn(),
  findDefaultConsultation: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

function fakeTreatment(overrides: Partial<Treatment> = {}): Treatment {
  return {
    id: 'treatment-1',
    code: 'tratamiento',
    name: 'Tratamiento',
    description: null,
    basePrice: 100,
    estimatedMinutes: 30,
    applicationType: 'single_tooth',
    currency: 'BOB',
    categoryId: 'category-1',
    categoryCode: 'operatoria_dental',
    categoryName: 'Operatoria dental',
    displayOrder: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

interface FakeAppointmentOptions {
  slot?: Date;
  status?: string;
  durationMinutes?: number;
}

function fakeAppointment(options: FakeAppointmentOptions = {}): Appointment {
  return new Appointment(
    'appt-1',
    null,
    null,
    options.slot ?? new Date(VALID_SLOT_ISO),
    options.durationMinutes ?? 30,
    options.status ?? AppointmentStatus.HELD,
    'public_web',
    null,
    null,
    null,
    null,
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
    // Congela el reloj antes de MONDAY para que holdSlot() no rechace los
    // slots fijos de este spec como "pasados" a medida que el tiempo avanza.
    jest.useFakeTimers().setSystemTime(new Date('2026-08-14T12:00:00-04:00'));
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: AppointmentRepository, useValue: mockRepo },
        { provide: TreatmentRepository, useValue: mockTreatmentRepo },
      ],
    }).compile();
    service = module.get(AppointmentsService);
  });

  afterEach(() => {
    jest.useRealTimers();
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

    // CLI-47: antes solo se bloqueaba el instante de inicio exacto — un
    // tratamiento de 90 min dejaba los 2 slots siguientes libres.
    it('excludes every slot a long appointment occupies, not just its start', async () => {
      const taken = fakeAppointment({
        slot: new Date(VALID_SLOT_ISO),
        durationMinutes: 90,
      });
      mockRepo.findActiveBetween.mockResolvedValue([taken]);

      const result = await service.getAvailability(MONDAY);

      const start = new Date(VALID_SLOT_ISO).getTime();
      for (const offsetMin of [0, 30, 60]) {
        expect(result.slots).not.toContain(
          new Date(start + offsetMin * 60_000).toISOString(),
        );
      }
      // El slot inmediatamente después de los 3 ocupados sigue libre.
      expect(result.slots).toContain(
        new Date(start + 90 * 60_000).toISOString(),
      );
    });

    it('rounds a non-multiple-of-30 duration up to the next full slot', async () => {
      const taken = fakeAppointment({
        slot: new Date(VALID_SLOT_ISO),
        durationMinutes: 45,
      });
      mockRepo.findActiveBetween.mockResolvedValue([taken]);

      const result = await service.getAvailability(MONDAY);

      const secondSlot = new Date(
        new Date(VALID_SLOT_ISO).getTime() + 30 * 60_000,
      ).toISOString();
      expect(result.slots).not.toContain(secondSlot);
    });
  });

  describe('getAvailabilityRange', () => {
    it('returns one entry per day, in order, keyed by date', async () => {
      mockRepo.findActiveBetween.mockResolvedValue([]);

      const result = await service.getAvailabilityRange(MONDAY, 3);

      expect(Object.keys(result.slotsByDate)).toEqual([
        '2026-08-17',
        '2026-08-18',
        '2026-08-19',
      ]);
      expect(result.from).toBe(MONDAY);
      expect(result.days).toBe(3);
    });

    it('leaves a closed day (Sunday) in the range as an empty array', async () => {
      mockRepo.findActiveBetween.mockResolvedValue([]);

      // 2026-08-16 es domingo.
      const result = await service.getAvailabilityRange('2026-08-15', 3);

      expect(result.slotsByDate['2026-08-16']).toEqual([]);
      expect(result.slotsByDate['2026-08-15'].length).toBeGreaterThan(0);
    });

    it('queries the repository once for the whole range, not once per day', async () => {
      mockRepo.findActiveBetween.mockResolvedValue([]);

      await service.getAvailabilityRange(MONDAY, 14);

      expect(mockRepo.findActiveBetween).toHaveBeenCalledTimes(1);
    });

    it('excludes a slot taken anywhere in the range from its day', async () => {
      const takenOnDayTwo = fakeAppointment({
        slot: new Date('2026-08-18T09:00:00-04:00'),
      });
      mockRepo.findActiveBetween.mockResolvedValue([takenOnDayTwo]);

      const result = await service.getAvailabilityRange(MONDAY, 3);

      expect(result.slotsByDate['2026-08-18']).not.toContain(
        new Date('2026-08-18T09:00:00-04:00').toISOString(),
      );
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

    it('returns the created hold on success, defaulting duration to one slot when no treatment is given', async () => {
      mockRepo.createHold.mockResolvedValue(fakeAppointment());

      const result = await service.holdSlot(VALID_SLOT_ISO);

      expect(result.appointmentId).toBe('appt-1');
      expect(mockRepo.createHold).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'public_web',
          treatmentId: null,
          durationMinutes: 30,
        }),
      );
      expect(mockTreatmentRepo.findById).not.toHaveBeenCalled();
    });

    // CLI-47: la duración real del tratamiento se congela en la cita.
    it('freezes the treatment estimatedMinutes as durationMinutes when a treatmentId is given', async () => {
      mockTreatmentRepo.findById.mockResolvedValue(
        fakeTreatment({ estimatedMinutes: 90 }),
      );
      mockRepo.createHold.mockResolvedValue(fakeAppointment());

      await service.holdSlot(VALID_SLOT_ISO, 'treatment-1');

      expect(mockTreatmentRepo.findById).toHaveBeenCalledWith('treatment-1');
      expect(mockRepo.createHold).toHaveBeenCalledWith(
        expect.objectContaining({
          treatmentId: 'treatment-1',
          durationMinutes: 90,
        }),
      );
    });

    it('rejects with 404 when the treatmentId does not exist, without touching the repo', async () => {
      mockTreatmentRepo.findById.mockResolvedValue(null);

      await expect(
        service.holdSlot(VALID_SLOT_ISO, 'missing-treatment'),
      ).rejects.toThrow(NotFoundException);
      expect(mockRepo.createHold).not.toHaveBeenCalled();
    });
  });

  describe('saveGuestContact', () => {
    it('returns the updated appointment when the hold is still active', async () => {
      mockRepo.updateGuestContact.mockResolvedValue(fakeAppointment());

      const result = await service.saveGuestContact(
        'appt-1',
        'Juana',
        'Perez',
        null,
        '70011122',
        null,
      );

      expect(result.id).toBe('appt-1');
    });

    it('passes the guest email and maternal surname through to the repository when provided', async () => {
      mockRepo.updateGuestContact.mockResolvedValue(fakeAppointment());

      await service.saveGuestContact(
        'appt-1',
        'Juana',
        'Perez',
        'Gomez',
        '70011122',
        'juana@example.com',
      );

      expect(mockRepo.updateGuestContact).toHaveBeenCalledWith(
        'appt-1',
        {
          firstName: 'Juana',
          lastNamePaternal: 'Perez',
          lastNameMaternal: 'Gomez',
          phone: '70011122',
          email: 'juana@example.com',
        },
        expect.any(Date),
      );
    });

    it('throws NotFoundException when the appointment does not exist at all', async () => {
      mockRepo.updateGuestContact.mockResolvedValue(null);
      mockRepo.findById.mockResolvedValue(null);

      await expect(
        service.saveGuestContact('missing', 'Juana', 'Perez', null, '70011122', null),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws GoneException (410) when the hold existed but already expired', async () => {
      mockRepo.updateGuestContact.mockResolvedValue(null);
      mockRepo.findById.mockResolvedValue(
        fakeAppointment({ status: AppointmentStatus.EXPIRED }),
      );

      await expect(
        service.saveGuestContact('appt-1', 'Juana', 'Perez', null, '70011122', null),
      ).rejects.toThrow(GoneException);
    });

    it('maps GuestPhoneConflictError to ConflictException (409)', async () => {
      mockRepo.updateGuestContact.mockRejectedValue(
        new GuestPhoneConflictError(),
      );

      await expect(
        service.saveGuestContact('appt-1', 'Juana', 'Perez', null, '70011122', null),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getAgenda', () => {
    it('delegates the filters straight to the repository', async () => {
      mockRepo.findForAgenda.mockResolvedValue([]);
      const filters = { status: 'confirmed' };

      await service.getAgenda(filters);

      expect(mockRepo.findForAgenda).toHaveBeenCalledWith(filters);
    });
  });
});
