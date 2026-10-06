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
  PatientNotFoundError,
  SlotUnavailableError,
} from '../domain/AppointmentRepository';
import { Appointment, AppointmentStatus } from '../domain/Appointment';
import { TreatmentRepository } from '../../treatments/domain/TreatmentRepository';
import type { Treatment } from '../../treatments/domain/Treatment';
import { DoctorRepository } from '../../doctors/domain/DoctorRepository';
import { DoctorScheduleRepository } from '../../doctors/domain/DoctorScheduleRepository';
import { DoctorTimeBlockRepository } from '../domain/DoctorTimeBlockRepository';

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
  createByDoctor: jest.fn(),
  findForDoctor: jest.fn(),
  reschedule: jest.fn(),
  cancel: jest.fn(),
  setAttendance: jest.fn(),
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

const mockTimeBlockRepo = {
  create: jest.fn(),
  findOverlapping: jest.fn(),
  deleteOwn: jest.fn(),
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
    // Sin horarios reservados por el doctor, salvo que el caso diga otra cosa (CLI-195).
    mockTimeBlockRepo.findOverlapping.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: AppointmentRepository, useValue: mockRepo },
        { provide: TreatmentRepository, useValue: mockTreatmentRepo },
        { provide: DoctorRepository, useValue: mockDoctorRepo },
        { provide: DoctorScheduleRepository, useValue: mockDoctorScheduleRepo },
        { provide: DoctorTimeBlockRepository, useValue: mockTimeBlockRepo },
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

    // CLI-194: el doctor agenda de a 5 minutos; esa cita puede empezar fuera de
    // la grilla de 30 y tapa todos los slots que su intervalo toca.
    it('una cita que empieza fuera de la grilla bloquea los slots que su intervalo toca', async () => {
      const start = new Date(`${MONDAY}T09:45:00-04:00`);
      const taken = fakeAppointment({ slot: start, durationMinutes: 75 });
      mockRepo.findActiveBetween.mockResolvedValue([taken]);

      const result = await service.getAvailability(DOCTOR_ID, MONDAY);

      // 09:45–11:00 toca los slots de 09:30, 10:00, 10:30 (11:00 empieza justo al terminar).
      for (const hhmm of ['09:30', '10:00', '10:30']) {
        expect(result.slots).not.toContain(
          new Date(`${MONDAY}T${hhmm}:00-04:00`).toISOString(),
        );
      }
      expect(result.slots).toContain(
        new Date(`${MONDAY}T09:00:00-04:00`).toISOString(),
      );
      expect(result.slots).toContain(
        new Date(`${MONDAY}T11:00:00-04:00`).toISOString(),
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
    beforeEach(() => {
      // Sin citas activas que se solapen, salvo que el caso diga otra cosa.
      mockRepo.findActiveBetween.mockResolvedValue([]);
    });

    // CLI-194: una cita del doctor fuera de la grilla de 30 puede tapar el slot.
    it('409 si una cita del doctor (a las 09:45, de 30 min) pisa el slot de las 10:00', async () => {
      mockRepo.findActiveBetween.mockResolvedValue([
        {
          id: 'doctor-appt',
          appointmentDatetime: new Date(`${MONDAY}T09:45:00-04:00`),
          durationMinutes: 30,
        },
      ]);

      await expect(
        service.holdSlot(DOCTOR_ID, `${MONDAY}T10:00:00-04:00`),
      ).rejects.toThrow(ConflictException);
      expect(mockRepo.createHold).not.toHaveBeenCalled();
    });

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
  // CLI-148: el doctor agenda la próxima cita de un paciente con ficha.
  // CLI-195: horarios que el doctor aparta de su agenda.
  describe('horarios reservados (CLI-195)', () => {
    const block = (hhmm: string, endHhmm: string) => ({
      id: 'block-1',
      doctorId: DOCTOR_ID,
      startsAt: new Date(`${MONDAY}T${hhmm}:00-04:00`),
      endsAt: new Date(`${MONDAY}T${endHhmm}:00-04:00`),
      reason: null,
    });

    beforeEach(() => {
      mockRepo.findActiveBetween.mockResolvedValue([]);
      mockTimeBlockRepo.create.mockImplementation(
        (data: { startsAt: Date; endsAt: Date; reason: string | null }) =>
          Promise.resolve({ id: 'block-new', doctorId: DOCTOR_ID, ...data }),
      );
    });

    it('crea el bloqueo con el doctor de la sesión y el motivo sin espacios de más', async () => {
      const created = await service.createTimeBlock(DOCTOR_ID, {
        startsAt: `${MONDAY}T14:00:00-04:00`,
        endsAt: `${MONDAY}T16:30:00-04:00`,
        reason: '  curso de ortodoncia ',
      });

      expect(mockTimeBlockRepo.create).toHaveBeenCalledWith({
        doctorId: DOCTOR_ID,
        startsAt: new Date(`${MONDAY}T14:00:00-04:00`),
        endsAt: new Date(`${MONDAY}T16:30:00-04:00`),
        reason: 'curso de ortodoncia',
      });
      expect(created.id).toBe('block-new');
    });

    it('sin motivo guarda null', async () => {
      await service.createTimeBlock(DOCTOR_ID, {
        startsAt: `${MONDAY}T14:00:00-04:00`,
        endsAt: `${MONDAY}T15:00:00-04:00`,
        reason: '   ',
      });

      expect(mockTimeBlockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ reason: null }),
      );
    });

    it.each([
      [
        'no es múltiplo de 5 minutos',
        `${MONDAY}T14:03:00-04:00`,
        `${MONDAY}T15:00:00-04:00`,
      ],
      [
        'el fin es anterior al inicio',
        `${MONDAY}T15:00:00-04:00`,
        `${MONDAY}T14:00:00-04:00`,
      ],
      [
        'el fin es igual al inicio',
        `${MONDAY}T15:00:00-04:00`,
        `${MONDAY}T15:00:00-04:00`,
      ],
      ['ya pasó', '2026-08-10T10:00:00-04:00', '2026-08-10T11:00:00-04:00'],
      [
        'dura más de 31 días',
        `${MONDAY}T10:00:00-04:00`,
        '2026-10-01T10:00:00-04:00',
      ],
    ])('rechaza (400) un horario que %s', async (_, startsAt, endsAt) => {
      await expect(
        service.createTimeBlock(DOCTOR_ID, { startsAt, endsAt }),
      ).rejects.toThrow(BadRequestException);
      expect(mockTimeBlockRepo.create).not.toHaveBeenCalled();
    });

    it('409 si ya tiene citas en ese rango, diciendo cuántas, y no crea nada', async () => {
      mockRepo.findActiveBetween.mockResolvedValue([
        {
          id: 'a1',
          appointmentDatetime: new Date(`${MONDAY}T14:30:00-04:00`),
          durationMinutes: 30,
        },
        {
          id: 'a2',
          appointmentDatetime: new Date(`${MONDAY}T15:00:00-04:00`),
          durationMinutes: 60,
        },
      ]);

      await expect(
        service.createTimeBlock(DOCTOR_ID, {
          startsAt: `${MONDAY}T14:00:00-04:00`,
          endsAt: `${MONDAY}T16:00:00-04:00`,
        }),
      ).rejects.toThrow(/ya tienes 2 citas/);
      expect(mockTimeBlockRepo.create).not.toHaveBeenCalled();
    });

    it('una cita que termina justo cuando empieza el bloqueo no choca', async () => {
      mockRepo.findActiveBetween.mockResolvedValue([
        {
          id: 'a1',
          appointmentDatetime: new Date(`${MONDAY}T13:00:00-04:00`),
          durationMinutes: 60,
        },
      ]);

      await service.createTimeBlock(DOCTOR_ID, {
        startsAt: `${MONDAY}T14:00:00-04:00`,
        endsAt: `${MONDAY}T15:00:00-04:00`,
      });

      expect(mockTimeBlockRepo.create).toHaveBeenCalled();
    });

    it('listTimeBlocks pide solo los del doctor y el rango', async () => {
      const from = new Date(`${MONDAY}T00:00:00-04:00`);
      const to = new Date('2026-08-24T00:00:00-04:00');
      mockTimeBlockRepo.findOverlapping.mockResolvedValue([
        block('14:00', '15:00'),
      ]);

      await expect(
        service.listTimeBlocks(DOCTOR_ID, from, to),
      ).resolves.toHaveLength(1);
      expect(mockTimeBlockRepo.findOverlapping).toHaveBeenCalledWith(
        DOCTOR_ID,
        from,
        to,
      );
    });

    it('deleteTimeBlock quita uno propio y da 404 si es ajeno o no existe', async () => {
      mockTimeBlockRepo.deleteOwn.mockResolvedValueOnce(true);
      await expect(
        service.deleteTimeBlock(DOCTOR_ID, 'block-1'),
      ).resolves.toBeUndefined();
      expect(mockTimeBlockRepo.deleteOwn).toHaveBeenCalledWith(
        'block-1',
        DOCTOR_ID,
      );

      mockTimeBlockRepo.deleteOwn.mockResolvedValueOnce(false);
      await expect(service.deleteTimeBlock(DOCTOR_ID, 'ajeno')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('la disponibilidad pública no ofrece los slots que toca un horario reservado', async () => {
      mockTimeBlockRepo.findOverlapping.mockResolvedValue([
        block('09:45', '11:00'),
      ]);

      const result = await service.getAvailability(DOCTOR_ID, MONDAY);

      for (const hhmm of ['09:30', '10:00', '10:30']) {
        expect(result.slots).not.toContain(
          new Date(`${MONDAY}T${hhmm}:00-04:00`).toISOString(),
        );
      }
      expect(result.slots).toContain(
        new Date(`${MONDAY}T09:00:00-04:00`).toISOString(),
      );
      expect(result.slots).toContain(
        new Date(`${MONDAY}T11:00:00-04:00`).toISOString(),
      );
    });

    it('el rango de disponibilidad también lo descuenta', async () => {
      mockTimeBlockRepo.findOverlapping.mockResolvedValue([
        block('09:00', '10:00'),
      ]);

      const result = await service.getAvailabilityRange(DOCTOR_ID, MONDAY, 1);

      expect(result.slotsByDate[MONDAY]).not.toContain(
        new Date(`${MONDAY}T09:00:00-04:00`).toISOString(),
      );
      expect(result.slotsByDate[MONDAY]).not.toContain(
        new Date(`${MONDAY}T09:30:00-04:00`).toISOString(),
      );
      expect(result.slotsByDate[MONDAY]).toContain(
        new Date(`${MONDAY}T10:00:00-04:00`).toISOString(),
      );
    });

    it('un paciente no puede reservar (holdSlot) encima de un horario reservado: 409 genérico', async () => {
      mockTimeBlockRepo.findOverlapping.mockResolvedValue([
        block('09:00', '10:00'),
      ]);

      await expect(service.holdSlot(DOCTOR_ID, VALID_SLOT_ISO)).rejects.toThrow(
        'Ese horario ya no está disponible',
      );
      expect(mockRepo.createHold).not.toHaveBeenCalled();
    });

    it('el doctor no puede agendar a un paciente encima de su propio bloqueo', async () => {
      mockTimeBlockRepo.findOverlapping.mockResolvedValue([
        block('09:00', '10:00'),
      ]);

      await expect(
        service.createByDoctor(DOCTOR_ID, {
          patientId: 'patient-1',
          appointmentDatetime: VALID_SLOT_ISO,
        }),
      ).rejects.toThrow(/reservado en tu agenda/);
      expect(mockRepo.createByDoctor).not.toHaveBeenCalled();
    });
  });

  describe('createByDoctor', () => {
    const PATIENT_ID = 'patient-1';
    const created = { id: 'appt-new' };

    beforeEach(() => {
      mockRepo.findActiveBetween.mockResolvedValue([]);
      mockRepo.createByDoctor.mockResolvedValue(created);
    });

    it('crea la cita para el doctor dado, con una franja por defecto y notas limpias', async () => {
      const result = await service.createByDoctor(DOCTOR_ID, {
        patientId: PATIENT_ID,
        appointmentDatetime: VALID_SLOT_ISO,
        notes: '  control de brackets  ',
      });

      expect(result).toBe(created);
      expect(mockRepo.createByDoctor).toHaveBeenCalledWith({
        doctorId: DOCTOR_ID,
        patientId: PATIENT_ID,
        treatmentId: null,
        appointmentDatetime: new Date(VALID_SLOT_ISO),
        durationMinutes: 30,
        notes: 'control de brackets',
      });
    });

    it('toma la duración del tratamiento si no se indica otra', async () => {
      mockTreatmentRepo.findById.mockResolvedValue(
        fakeTreatment({ estimatedMinutes: 90 }),
      );

      await service.createByDoctor(DOCTOR_ID, {
        patientId: PATIENT_ID,
        appointmentDatetime: VALID_SLOT_ISO,
        treatmentId: 'treatment-1',
      });

      expect(mockRepo.createByDoctor).toHaveBeenCalledWith(
        expect.objectContaining({
          treatmentId: 'treatment-1',
          durationMinutes: 90,
        }),
      );
    });

    it('la duración explícita gana sobre la del tratamiento', async () => {
      mockTreatmentRepo.findById.mockResolvedValue(
        fakeTreatment({ estimatedMinutes: 90 }),
      );

      await service.createByDoctor(DOCTOR_ID, {
        patientId: PATIENT_ID,
        appointmentDatetime: VALID_SLOT_ISO,
        treatmentId: 'treatment-1',
        durationMinutes: 60,
      });

      expect(mockRepo.createByDoctor).toHaveBeenCalledWith(
        expect.objectContaining({ durationMinutes: 60 }),
      );
    });

    it('404 si el tratamiento no existe', async () => {
      mockTreatmentRepo.findById.mockResolvedValue(null);

      await expect(
        service.createByDoctor(DOCTOR_ID, {
          patientId: PATIENT_ID,
          appointmentDatetime: VALID_SLOT_ISO,
          treatmentId: 'missing',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(mockRepo.createByDoctor).not.toHaveBeenCalled();
    });

    it('permite agendar fuera del horario de atención del doctor (emergencias)', async () => {
      // Domingo 21:00 — el fixture tiene el domingo cerrado.
      await service.createByDoctor(DOCTOR_ID, {
        patientId: PATIENT_ID,
        appointmentDatetime: '2026-08-16T21:00:00-04:00',
      });

      expect(mockRepo.createByDoctor).toHaveBeenCalled();
      expect(mockDoctorScheduleRepo.findBlocksForDoctor).not.toHaveBeenCalled();
    });

    it('400 si la cita es en el pasado', async () => {
      await expect(
        service.createByDoctor(DOCTOR_ID, {
          patientId: PATIENT_ID,
          appointmentDatetime: '2026-08-14T09:00:00-04:00',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.createByDoctor).not.toHaveBeenCalled();
    });

    // CLI-194: el doctor agenda de a 5 minutos, ya no solo de a 30.
    it('400 si no empieza en un múltiplo de 5 minutos', async () => {
      await expect(
        service.createByDoctor(DOCTOR_ID, {
          patientId: PATIENT_ID,
          appointmentDatetime: `${MONDAY}T09:12:00-04:00`,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.createByDoctor).not.toHaveBeenCalled();
    });

    it('acepta empezar a las 09:45 con una duración de 75 minutos', async () => {
      await service.createByDoctor(DOCTOR_ID, {
        patientId: PATIENT_ID,
        appointmentDatetime: `${MONDAY}T09:45:00-04:00`,
        durationMinutes: 75,
      });

      expect(mockRepo.createByDoctor).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentDatetime: new Date(`${MONDAY}T09:45:00-04:00`),
          durationMinutes: 75,
        }),
      );
    });

    it('busca choques solo en la agenda de ese doctor', async () => {
      await service.createByDoctor(DOCTOR_ID, {
        patientId: PATIENT_ID,
        appointmentDatetime: VALID_SLOT_ISO,
        durationMinutes: 60,
      });

      const [from, to, , doctorId] = (
        mockRepo.findActiveBetween.mock.calls as unknown[][]
      )[0] as [Date, Date, Date, string];
      expect(doctorId).toBe(DOCTOR_ID);
      expect(from.getTime()).toBeLessThan(new Date(VALID_SLOT_ISO).getTime());
      expect(to).toEqual(new Date(`${MONDAY}T10:00:00-04:00`));
    });

    it('409 si una cita anterior más larga todavía está en curso', async () => {
      // 08:30 + 60 min = hasta las 09:30: pisa la nueva de las 09:00.
      mockRepo.findActiveBetween.mockResolvedValue([
        fakeAppointment({
          slot: new Date(`${MONDAY}T08:30:00-04:00`),
          durationMinutes: 60,
          status: AppointmentStatus.CONFIRMED,
        }),
      ]);

      await expect(
        service.createByDoctor(DOCTOR_ID, {
          patientId: PATIENT_ID,
          appointmentDatetime: VALID_SLOT_ISO,
        }),
      ).rejects.toThrow(ConflictException);
      expect(mockRepo.createByDoctor).not.toHaveBeenCalled();
    });

    it('no choca con una cita que termina justo cuando empieza la nueva', async () => {
      mockRepo.findActiveBetween.mockResolvedValue([
        fakeAppointment({
          slot: new Date(`${MONDAY}T08:00:00-04:00`),
          durationMinutes: 60,
          status: AppointmentStatus.CONFIRMED,
        }),
      ]);

      await service.createByDoctor(DOCTOR_ID, {
        patientId: PATIENT_ID,
        appointmentDatetime: VALID_SLOT_ISO,
      });

      expect(mockRepo.createByDoctor).toHaveBeenCalled();
    });

    it('409 si la nueva cita, por su duración, pisa una posterior', async () => {
      mockRepo.findActiveBetween.mockResolvedValue([
        fakeAppointment({
          slot: new Date(`${MONDAY}T09:30:00-04:00`),
          status: AppointmentStatus.CONFIRMED,
        }),
      ]);

      await expect(
        service.createByDoctor(DOCTOR_ID, {
          patientId: PATIENT_ID,
          appointmentDatetime: VALID_SLOT_ISO,
          durationMinutes: 60,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('traduce la carrera en el índice único (SlotUnavailableError) a 409', async () => {
      mockRepo.createByDoctor.mockRejectedValue(new SlotUnavailableError());

      await expect(
        service.createByDoctor(DOCTOR_ID, {
          patientId: PATIENT_ID,
          appointmentDatetime: VALID_SLOT_ISO,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('404 si el paciente no existe', async () => {
      mockRepo.createByDoctor.mockRejectedValue(new PatientNotFoundError());

      await expect(
        service.createByDoctor(DOCTOR_ID, {
          patientId: 'missing',
          appointmentDatetime: VALID_SLOT_ISO,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDoctorSchedule', () => {
    it('devuelve los bloques del doctor dado', async () => {
      await expect(service.getDoctorSchedule(DOCTOR_ID)).resolves.toBe(
        CLINIC_HOURS_FIXTURE,
      );
      expect(mockDoctorScheduleRepo.findBlocksForDoctor).toHaveBeenCalledWith(
        DOCTOR_ID,
      );
    });
  });
  // CLI-149
  describe('rescheduleByDoctor', () => {
    const APPT_ID = 'appt-moving';
    const confirmed = {
      id: APPT_ID,
      status: AppointmentStatus.CONFIRMED,
      durationMinutes: 60,
    };

    beforeEach(() => {
      mockRepo.findForDoctor.mockResolvedValue(confirmed);
      mockRepo.findActiveBetween.mockResolvedValue([]);
      mockRepo.reschedule.mockResolvedValue({ ...confirmed, id: APPT_ID });
    });

    it('mueve la cita conservando su duración si no se indica otra', async () => {
      await service.rescheduleByDoctor(DOCTOR_ID, APPT_ID, {
        appointmentDatetime: VALID_SLOT_ISO,
      });

      expect(mockRepo.findForDoctor).toHaveBeenCalledWith(APPT_ID, DOCTOR_ID);
      expect(mockRepo.reschedule).toHaveBeenCalledWith(APPT_ID, DOCTOR_ID, {
        appointmentDatetime: new Date(VALID_SLOT_ISO),
        durationMinutes: 60,
      });
    });

    it('actualiza duración y notas si vienen (vacío borra las notas)', async () => {
      await service.rescheduleByDoctor(DOCTOR_ID, APPT_ID, {
        appointmentDatetime: VALID_SLOT_ISO,
        durationMinutes: 30,
        notes: '   ',
      });

      expect(mockRepo.reschedule).toHaveBeenCalledWith(APPT_ID, DOCTOR_ID, {
        appointmentDatetime: new Date(VALID_SLOT_ISO),
        durationMinutes: 30,
        notes: null,
      });
    });

    it('no choca consigo misma al correrla media hora', async () => {
      mockRepo.findActiveBetween.mockResolvedValue([
        new Appointment(
          APPT_ID,
          null,
          null,
          new Date(`${MONDAY}T08:30:00-04:00`),
          60,
          AppointmentStatus.CONFIRMED,
          'doctor',
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          new Date(),
          null,
          null,
          null,
          null,
          null,
        ),
      ]);

      await service.rescheduleByDoctor(DOCTOR_ID, APPT_ID, {
        appointmentDatetime: VALID_SLOT_ISO,
      });

      expect(mockRepo.reschedule).toHaveBeenCalled();
    });

    it('409 si el nuevo horario pisa otra cita', async () => {
      mockRepo.findActiveBetween.mockResolvedValue([
        fakeAppointment({
          slot: new Date(`${MONDAY}T09:30:00-04:00`),
          status: AppointmentStatus.CONFIRMED,
        }),
      ]);

      await expect(
        service.rescheduleByDoctor(DOCTOR_ID, APPT_ID, {
          appointmentDatetime: VALID_SLOT_ISO,
        }),
      ).rejects.toThrow(ConflictException);
      expect(mockRepo.reschedule).not.toHaveBeenCalled();
    });

    it('404 si la cita no existe o es de otro doctor', async () => {
      mockRepo.findForDoctor.mockResolvedValue(null);

      await expect(
        service.rescheduleByDoctor(DOCTOR_ID, APPT_ID, {
          appointmentDatetime: VALID_SLOT_ISO,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('409 si la cita no está confirmada', async () => {
      mockRepo.findForDoctor.mockResolvedValue({
        ...confirmed,
        status: AppointmentStatus.CANCELLED,
      });

      await expect(
        service.rescheduleByDoctor(DOCTOR_ID, APPT_ID, {
          appointmentDatetime: VALID_SLOT_ISO,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('400 si el nuevo horario es pasado o no es múltiplo de 5 minutos', async () => {
      await expect(
        service.rescheduleByDoctor(DOCTOR_ID, APPT_ID, {
          appointmentDatetime: '2026-08-13T09:00:00-04:00',
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.rescheduleByDoctor(DOCTOR_ID, APPT_ID, {
          appointmentDatetime: `${MONDAY}T09:12:00-04:00`,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('409 si la cancelaron entre la lectura y el UPDATE', async () => {
      mockRepo.reschedule.mockResolvedValue(null);

      await expect(
        service.rescheduleByDoctor(DOCTOR_ID, APPT_ID, {
          appointmentDatetime: VALID_SLOT_ISO,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('traduce SlotUnavailableError a 409', async () => {
      mockRepo.reschedule.mockRejectedValue(new SlotUnavailableError());

      await expect(
        service.rescheduleByDoctor(DOCTOR_ID, APPT_ID, {
          appointmentDatetime: VALID_SLOT_ISO,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('cancelByDoctor', () => {
    const APPT_ID = 'appt-1';
    const confirmed = { id: APPT_ID, status: AppointmentStatus.CONFIRMED };
    const cancelled = { id: APPT_ID, status: AppointmentStatus.CANCELLED };

    it('cancela la cita propia, registrando quién y el motivo limpio', async () => {
      mockRepo.findForDoctor.mockResolvedValue(confirmed);
      mockRepo.cancel.mockResolvedValue(cancelled);

      await expect(
        service.cancelByDoctor(DOCTOR_ID, APPT_ID, '  no puede venir '),
      ).resolves.toBe(cancelled);
      expect(mockRepo.cancel).toHaveBeenCalledWith(
        APPT_ID,
        DOCTOR_ID,
        DOCTOR_ID,
        'no puede venir',
      );
    });

    it('sin motivo pasa null', async () => {
      mockRepo.findForDoctor.mockResolvedValue(confirmed);
      mockRepo.cancel.mockResolvedValue(cancelled);

      await service.cancelByDoctor(DOCTOR_ID, APPT_ID);

      expect(mockRepo.cancel).toHaveBeenCalledWith(
        APPT_ID,
        DOCTOR_ID,
        DOCTOR_ID,
        null,
      );
    });

    it('es idempotente: una ya cancelada se devuelve sin tocarla', async () => {
      mockRepo.findForDoctor.mockResolvedValue(cancelled);

      await expect(service.cancelByDoctor(DOCTOR_ID, APPT_ID)).resolves.toBe(
        cancelled,
      );
      expect(mockRepo.cancel).not.toHaveBeenCalled();
    });

    it('404 si la cita no existe o es de otro doctor', async () => {
      mockRepo.findForDoctor.mockResolvedValue(null);

      await expect(service.cancelByDoctor(DOCTOR_ID, APPT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('409 si no está confirmada (ej. un hold)', async () => {
      mockRepo.findForDoctor.mockResolvedValue({
        id: APPT_ID,
        status: AppointmentStatus.HELD,
      });

      await expect(service.cancelByDoctor(DOCTOR_ID, APPT_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('si otra request la canceló en el medio, devuelve la cancelada', async () => {
      mockRepo.findForDoctor
        .mockResolvedValueOnce(confirmed)
        .mockResolvedValueOnce(cancelled);
      mockRepo.cancel.mockResolvedValue(null);

      await expect(service.cancelByDoctor(DOCTOR_ID, APPT_ID)).resolves.toBe(
        cancelled,
      );
    });
  });

  // CLI-208
  describe('markNoShow / undoNoShow', () => {
    const APPT_ID = 'appt-1';
    const NOW = new Date('2026-10-06T15:00:00Z');
    const PAST = new Date('2026-10-06T13:00:00Z');
    const FUTURE = new Date('2026-10-06T17:00:00Z');
    const confirmed = {
      id: APPT_ID,
      status: AppointmentStatus.CONFIRMED,
      appointmentDatetime: PAST,
    };
    const noShow = { ...confirmed, status: AppointmentStatus.NO_SHOW };

    it('marca "No asistió" en una cita propia confirmada que ya pasó', async () => {
      mockRepo.findForDoctor.mockResolvedValue(confirmed);
      mockRepo.setAttendance.mockResolvedValue(noShow);

      await expect(service.markNoShow(DOCTOR_ID, APPT_ID, NOW)).resolves.toBe(
        noShow,
      );
      expect(mockRepo.setAttendance).toHaveBeenCalledWith(
        APPT_ID,
        DOCTOR_ID,
        AppointmentStatus.CONFIRMED,
        AppointmentStatus.NO_SHOW,
      );
    });

    it('deshace "No asistió": vuelve a confirmada', async () => {
      mockRepo.findForDoctor.mockResolvedValue(noShow);
      mockRepo.setAttendance.mockResolvedValue(confirmed);

      await expect(service.undoNoShow(DOCTOR_ID, APPT_ID, NOW)).resolves.toBe(
        confirmed,
      );
      expect(mockRepo.setAttendance).toHaveBeenCalledWith(
        APPT_ID,
        DOCTOR_ID,
        AppointmentStatus.NO_SHOW,
        AppointmentStatus.CONFIRMED,
      );
    });

    it('es idempotente: si ya está en el estado pedido no la toca', async () => {
      mockRepo.findForDoctor.mockResolvedValue(noShow);

      await expect(service.markNoShow(DOCTOR_ID, APPT_ID, NOW)).resolves.toBe(
        noShow,
      );
      expect(mockRepo.setAttendance).not.toHaveBeenCalled();
    });

    it('409 si la cita todavía no pasó', async () => {
      mockRepo.findForDoctor.mockResolvedValue({
        ...confirmed,
        appointmentDatetime: FUTURE,
      });

      await expect(service.markNoShow(DOCTOR_ID, APPT_ID, NOW)).rejects.toThrow(
        ConflictException,
      );
      expect(mockRepo.setAttendance).not.toHaveBeenCalled();
    });

    it('409 si la cita está cancelada', async () => {
      mockRepo.findForDoctor.mockResolvedValue({
        ...confirmed,
        status: AppointmentStatus.CANCELLED,
      });

      await expect(service.markNoShow(DOCTOR_ID, APPT_ID, NOW)).rejects.toThrow(
        ConflictException,
      );
    });

    it('404 si la cita no existe o es de otro doctor', async () => {
      mockRepo.findForDoctor.mockResolvedValue(null);

      await expect(service.markNoShow(DOCTOR_ID, APPT_ID, NOW)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('409 si al deshacer choca con otra cita activa', async () => {
      mockRepo.findForDoctor.mockResolvedValue(noShow);
      mockRepo.setAttendance.mockRejectedValue(new SlotUnavailableError());

      await expect(service.undoNoShow(DOCTOR_ID, APPT_ID, NOW)).rejects.toThrow(
        ConflictException,
      );
    });

    it('propaga cualquier otro error del repositorio', async () => {
      mockRepo.findForDoctor.mockResolvedValue(confirmed);
      mockRepo.setAttendance.mockRejectedValue(new Error('boom'));

      await expect(service.markNoShow(DOCTOR_ID, APPT_ID, NOW)).rejects.toThrow(
        'boom',
      );
    });

    it('si otra request la cambió en el medio, devuelve la ya marcada', async () => {
      mockRepo.findForDoctor
        .mockResolvedValueOnce(confirmed)
        .mockResolvedValueOnce(noShow);
      mockRepo.setAttendance.mockResolvedValue(null);

      await expect(service.markNoShow(DOCTOR_ID, APPT_ID, NOW)).resolves.toBe(
        noShow,
      );
    });

    it('si en el medio quedó en otro estado, 409', async () => {
      mockRepo.findForDoctor
        .mockResolvedValueOnce(confirmed)
        .mockResolvedValueOnce({
          ...confirmed,
          status: AppointmentStatus.CANCELLED,
        });
      mockRepo.setAttendance.mockResolvedValue(null);

      await expect(service.markNoShow(DOCTOR_ID, APPT_ID, NOW)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
