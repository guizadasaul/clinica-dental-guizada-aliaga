import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from '../../application/appointments.service';

const DOCTOR_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

function throttleLimit(handler: string): () => number {
  return Reflect.getMetadata(
    `${THROTTLER_LIMIT}default`,
    Reflect.get(AppointmentsController.prototype, handler) as object,
  ) as () => number;
}

describe('AppointmentsController (reserva pública)', () => {
  const service = {
    getAvailability: jest.fn(),
    getAvailabilityRange: jest.fn(),
    holdSlot: jest.fn(),
    saveGuestContact: jest.fn(),
  };
  const controller = new AppointmentsController(
    service as unknown as AppointmentsService,
  );
  const savedEnv = { ...process.env };

  beforeEach(() => jest.clearAllMocks());

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('availability consulta un día de un doctor', async () => {
    service.getAvailability.mockResolvedValue({
      date: '2026-09-24',
      slots: [],
    });

    await expect(
      controller.getAvailability({ doctorId: DOCTOR_ID, date: '2026-09-24' }),
    ).resolves.toEqual({ date: '2026-09-24', slots: [] });
    expect(service.getAvailability).toHaveBeenCalledWith(
      DOCTOR_ID,
      '2026-09-24',
    );
  });

  it('availability-range usa los días pedidos', async () => {
    await controller.getAvailabilityRange({
      doctorId: DOCTOR_ID,
      from: '2026-09-24',
      days: 7,
    });

    expect(service.getAvailabilityRange).toHaveBeenCalledWith(
      DOCTOR_ID,
      '2026-09-24',
      7,
    );
  });

  it('availability-range sin days muestra dos semanas', async () => {
    await controller.getAvailabilityRange({
      doctorId: DOCTOR_ID,
      from: '2026-09-24',
    });

    expect(service.getAvailabilityRange).toHaveBeenCalledWith(
      DOCTOR_ID,
      '2026-09-24',
      14,
    );
  });

  it('hold reserva el horario, con tratamiento si vino', async () => {
    service.holdSlot.mockResolvedValue({ appointmentId: 'appt-1' });

    await expect(
      controller.holdSlot({
        doctorId: DOCTOR_ID,
        slot: '2026-09-24T13:00:00Z',
        treatmentId: 'treatment-1',
      }),
    ).resolves.toEqual({ appointmentId: 'appt-1' });
    expect(service.holdSlot).toHaveBeenCalledWith(
      DOCTOR_ID,
      '2026-09-24T13:00:00Z',
      'treatment-1',
    );
  });

  describe('contacto del invitado', () => {
    const base = {
      firstName: 'Ana',
      lastNamePaternal: 'Pérez',
      phone: '+59170000000',
    };

    it('pasa todos los datos', async () => {
      await controller.saveGuestContact('appt-1', {
        ...base,
        lastNameMaternal: 'Rojas',
        email: 'ana@example.com',
      });

      expect(service.saveGuestContact).toHaveBeenCalledWith(
        'appt-1',
        'Ana',
        'Pérez',
        'Rojas',
        '+59170000000',
        'ana@example.com',
      );
    });

    it('apellido materno y email son opcionales (quedan en null)', async () => {
      await controller.saveGuestContact('appt-1', base);

      expect(service.saveGuestContact).toHaveBeenCalledWith(
        'appt-1',
        'Ana',
        'Pérez',
        null,
        '+59170000000',
        null,
      );
    });
  });

  // CLI-36: límites por IP, configurables por env y leídos por request.
  it.each([
    ['holdSlot', 'THROTTLE_APPOINTMENTS_HOLD_PER_HOUR', 5],
    ['saveGuestContact', 'THROTTLE_APPOINTMENTS_CONTACT_PER_HOUR', 10],
  ])('%s: %s, %i por hora por default', (handler, envName, fallback) => {
    const limit = throttleLimit(handler);

    delete process.env[envName];
    expect(limit()).toBe(fallback);
    process.env[envName] = '50';
    expect(limit()).toBe(50);
  });
});
