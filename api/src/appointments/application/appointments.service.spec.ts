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
  GuestEmailBelongsToAccountError,
  GuestPhoneBelongsToAccountError,
  GuestPhoneConflictError,
  SlotUnavailableError,
} from '../domain/AppointmentRepository';
import { Appointment, AppointmentStatus } from '../domain/Appointment';
import { TreatmentRepository } from '../../treatments/domain/TreatmentRepository';
import type { Treatment } from '../../treatments/domain/Treatment';
import { DoctorRepository } from '../../doctors/domain/DoctorRepository';
import { DoctorScheduleRepository } from '../../doctors/domain/DoctorScheduleRepository';

const MONDAY = '2026-08-17';
const VALID_SLOT_ISO = `${MONDAY}T09:00:00-04:00`;
const DOCTOR_ID = 'doctor-1';

// Mismo horario que el WEEKDAY_BLOCKS hardcodeado que ClinicSchedule tenía
// antes de CLI-56 — Lun-Vie 09-12/15-19, Sáb 09-12, domingo cerrado.
const CLINIC_HOURS_FIXTURE = [
  { weekday: 1, start: '09:00', end: '12:00' },
  { weekday: 1, start: '15:00', end: '19:00' },
  { weekday: 2, start: '09:00', end: '12:00' },
  { weekday: 2, start: '15:00', end: '19:00' },
  { weekday: 3, start: '09:00', end: '12:00' },
  { weekday: 3, start: '15:00', end: '19:00' },
  { weekday: 4, start: '09:00', end: '12:00' },
  { weekday: 4, start: '15:00', end: '19:00' },
  { weekday: 5, start: '09:00', end: '12:00' },
  { weekday: 5, start: '15:00', end: '19:00' },
  { weekday: 6, start: '09:00', end: '12:00' },
];

const mockRepo = {
  findActiveBetween: jest.fn(),
  findById: jest.fn(),
  findByQrId: jest.fn(),
  createHold: jest.fn(),
  updateGuestContact: jest.fn(),
  attachQr: jest.fn(),
  appendNote: jest.fn(),
  findForAgenda: jest.fn(),
  findForPatient: jest.fn(),
};

const mockTreatmentRepo = {
  findActive: jest.fn(),
  findById: jest.fn(),
  findDefaultConsultation: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};

const mockDoctorRepo = {
  findBookable: jest.fn(),
  isBookable: jest.fn(),
};

const mockDoctorScheduleRepo = {
  findBlocksForDoctor: jest.fn(),
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
    categoryColor: '#16a34a',
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
    mockDoctorRepo.isBookable.mockResolvedValue(true);
    mockDoctorScheduleRepo.findBlocksForDoctor.mockResolvedValue(
      CLINIC_HOURS_FIXTURE,
    );
    const module = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: AppointmentRepository, useValue: mockRepo },
        { provide: TreatmentRepository, useValue: mockTreatmentRepo },
        { provide: DoctorRepository, useValue: mockDoctorRepo },
        { provide: DoctorScheduleRepository, useValue: mockDoctorScheduleRepo },
      ],
    }).compile();
    service = module.get(AppointmentsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getAvailability', () => {
    it('rejects with 404 when the doctorId is not bookable, without touching the schedule or the repo', async () => {
      mockDoctorRepo.isBookable.mockResolvedValue(false);

      await expect(
        service.getAvailability('missing-doctor', MONDAY),
      ).rejects.toThrow(NotFoundException);
      expect(mockDoctorScheduleRepo.findBlocksForDoctor).not.toHaveBeenCalled();
      expect(mockRepo.findActiveBetween).not.toHaveBeenCalled();
    });

    it('queries the repository scoped to the given doctorId', async () => {
      mockRepo.findActiveBetween.mockResolvedValue([]);

      await service.getAvailability(DOCTOR_ID, MONDAY);

      expect(mockDoctorScheduleRepo.findBlocksForDoctor).toHaveBeenCalledWith(
        DOCTOR_ID,
      );
      expect(mockRepo.findActiveBetween).toHaveBeenCalledWith(
        expect.any(Date),
        expect.any(Date),
        expect.any(Date),
        DOCTOR_ID,
      );
    });

    it('returns no slots and never queries the repo on a closed day (Sunday)', async () => {
      const result = await service.getAvailability(DOCTOR_ID, '2026-08-16');

      expect(result.slots).toHaveLength(0);
      expect(mockRepo.findActiveBetween).not.toHaveBeenCalled();
    });

    it('excludes a slot that already has an active appointment', async () => {
      const taken = fakeAppointment({ slot: new Date(VALID_SLOT_ISO) });
      mockRepo.findActiveBetween.mockResolvedValue([taken]);

      const result = await service.getAvailability(DOCTOR_ID, MONDAY);

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

      const result = await service.getAvailability(DOCTOR_ID, MONDAY);

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

      const result = await service.getAvailability(DOCTOR_ID, MONDAY);

      const secondSlot = new Date(
        new Date(VALID_SLOT_ISO).getTime() + 30 * 60_000,
      ).toISOString();
      expect(result.slots).not.toContain(secondSlot);
    });
  });

  describe('getAvailabilityRange', () => {
    it('rejects with 404 when the doctorId is not bookable, without touching the repo', async () => {
      mockDoctorRepo.isBookable.mockResolvedValue(false);

      await expect(
        service.getAvailabilityRange('missing-doctor', MONDAY, 3),
      ).rejects.toThrow(NotFoundException);
      expect(mockRepo.findActiveBetween).not.toHaveBeenCalled();
    });

    it('returns one entry per day, in order, keyed by date', async () => {
      mockRepo.findActiveBetween.mockResolvedValue([]);

      const result = await service.getAvailabilityRange(DOCTOR_ID, MONDAY, 3);

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
      const result = await service.getAvailabilityRange(
        DOCTOR_ID,
        '2026-08-15',
        3,
      );

      expect(result.slotsByDate['2026-08-16']).toEqual([]);
      expect(result.slotsByDate['2026-08-15'].length).toBeGreaterThan(0);
    });

    it('queries the repository once for the whole range, not once per day', async () => {
      mockRepo.findActiveBetween.mockResolvedValue([]);

      await service.getAvailabilityRange(DOCTOR_ID, MONDAY, 14);

      expect(mockRepo.findActiveBetween).toHaveBeenCalledTimes(1);
    });

    it('excludes a slot taken anywhere in the range from its day', async () => {
      const takenOnDayTwo = fakeAppointment({
        slot: new Date('2026-08-18T09:00:00-04:00'),
      });
      mockRepo.findActiveBetween.mockResolvedValue([takenOnDayTwo]);

      const result = await service.getAvailabilityRange(DOCTOR_ID, MONDAY, 3);

      expect(result.slotsByDate['2026-08-18']).not.toContain(
        new Date('2026-08-18T09:00:00-04:00').toISOString(),
      );
    });
  });

  describe('holdSlot', () => {
    it('rejects an off-grid slot without touching the repo', async () => {
      await expect(
        service.holdSlot(DOCTOR_ID, `${MONDAY}T09:15:00-04:00`),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.createHold).not.toHaveBeenCalled();
    });

    it('rejects a slot in the past without touching the repo', async () => {
      await expect(
        service.holdSlot(DOCTOR_ID, '2020-01-06T09:00:00-04:00'),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.createHold).not.toHaveBeenCalled();
    });

    it('maps SlotUnavailableError to ConflictException (409)', async () => {
      mockRepo.createHold.mockRejectedValue(new SlotUnavailableError());

      await expect(service.holdSlot(DOCTOR_ID, VALID_SLOT_ISO)).rejects.toThrow(
        ConflictException,
      );
    });

    it('returns the created hold on success, defaulting duration to one slot when no treatment is given', async () => {
      mockRepo.createHold.mockResolvedValue(fakeAppointment());

      const result = await service.holdSlot(DOCTOR_ID, VALID_SLOT_ISO);

      expect(result.appointmentId).toBe('appt-1');
      expect(mockRepo.createHold).toHaveBeenCalledWith(
        expect.objectContaining({
          doctorId: DOCTOR_ID,
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

      await service.holdSlot(DOCTOR_ID, VALID_SLOT_ISO, 'treatment-1');

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
        service.holdSlot(DOCTOR_ID, VALID_SLOT_ISO, 'missing-treatment'),
      ).rejects.toThrow(NotFoundException);
      expect(mockRepo.createHold).not.toHaveBeenCalled();
    });

    it('rejects with 404 when the doctorId is not bookable, without touching the repo', async () => {
      mockDoctorRepo.isBookable.mockResolvedValue(false);

      await expect(
        service.holdSlot('missing-doctor', VALID_SLOT_ISO),
      ).rejects.toThrow(NotFoundException);
      expect(mockDoctorScheduleRepo.findBlocksForDoctor).not.toHaveBeenCalled();
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
        service.saveGuestContact(
          'missing',
          'Juana',
          'Perez',
          null,
          '70011122',
          null,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws GoneException (410) when the hold existed but already expired', async () => {
      mockRepo.updateGuestContact.mockResolvedValue(null);
      mockRepo.findById.mockResolvedValue(
        fakeAppointment({ status: AppointmentStatus.EXPIRED }),
      );

      await expect(
        service.saveGuestContact(
          'appt-1',
          'Juana',
          'Perez',
          null,
          '70011122',
          null,
        ),
      ).rejects.toThrow(GoneException);
    });

    it('maps GuestPhoneConflictError to ConflictException (409)', async () => {
      mockRepo.updateGuestContact.mockRejectedValue(
        new GuestPhoneConflictError(),
      );

      await expect(
        service.saveGuestContact(
          'appt-1',
          'Juana',
          'Perez',
          null,
          '70011122',
          null,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('maps GuestEmailBelongsToAccountError to ConflictException (409)', async () => {
      mockRepo.updateGuestContact.mockRejectedValue(
        new GuestEmailBelongsToAccountError(),
      );

      await expect(
        service.saveGuestContact(
          'appt-1',
          'Juana',
          'Perez',
          null,
          '70011122',
          'juana@example.com',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('maps GuestPhoneBelongsToAccountError to ConflictException (409)', async () => {
      mockRepo.updateGuestContact.mockRejectedValue(
        new GuestPhoneBelongsToAccountError(),
      );

      await expect(
        service.saveGuestContact(
          'appt-1',
          'Juana',
          'Perez',
          null,
          '70011122',
          null,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getPatientAppointments (CLI-91)', () => {
    const NOW_FIXED = new Date('2026-09-25T12:00:00Z');

    it('upcoming: desde ahora, la más cercana primero', async () => {
      mockRepo.findForPatient.mockResolvedValue([]);

      await service.getPatientAppointments(
        'patient-1',
        'upcoming',
        1,
        NOW_FIXED,
      );

      expect(mockRepo.findForPatient).toHaveBeenCalledWith('patient-1', {
        from: NOW_FIXED,
        order: 'asc',
        limit: 1,
      });
    });

    it('past: hasta ahora, la más reciente primero', async () => {
      mockRepo.findForPatient.mockResolvedValue([]);

      await service.getPatientAppointments('patient-1', 'past', 5, NOW_FIXED);

      expect(mockRepo.findForPatient).toHaveBeenCalledWith('patient-1', {
        to: NOW_FIXED,
        order: 'desc',
        limit: 5,
      });
    });

    it('usa la hora actual por defecto', async () => {
      mockRepo.findForPatient.mockResolvedValue([]);
      const before = Date.now();

      await service.getPatientAppointments('patient-1', 'upcoming', 1);

      const filters = (
        mockRepo.findForPatient.mock.calls as unknown[][]
      )[0][1] as {
        from: Date;
      };
      expect(filters.from.getTime()).toBeGreaterThanOrEqual(before);
    });
  });

  describe('getAgenda', () => {
    it('delegates the filters straight to the repository', async () => {
      mockRepo.findForAgenda.mockResolvedValue([]);
      const filters = { doctorId: DOCTOR_ID, status: 'confirmed' };

      await service.getAgenda(filters);

      expect(mockRepo.findForAgenda).toHaveBeenCalledWith(filters);
    });
  });
});
