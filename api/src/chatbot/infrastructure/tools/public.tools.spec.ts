import type { AppointmentsService } from '../../../appointments/application/appointments.service';
import type { TreatmentsService } from '../../../treatments/application/treatments.service';
import type { PricedTreatment } from '../../../treatments/application/PricedTreatment';
import type { Doctor } from '../../../doctors/domain/Doctor';
import type { ChatActor } from '../../domain/ChatActor';
import { CLINIC_FAQ, CLINIC_INFO } from '../knowledge/clinic-info';
import { ClassValidatorToolArgsValidator } from './class-validator-tool-args.validator';
import { ToolOutputWithLinks } from '../../domain/ChatLink';
import {
  GetAvailableSlotsTool,
  GetBookingLinkTool,
  GetClinicInfoTool,
  GetFaqTool,
  ListDoctorsTool,
  ListServicesTool,
  PUBLIC_TOOLS,
} from './public.tools';

const anonymous: ChatActor = { kind: 'anonymous' };
const DOCTOR_A = '11111111-1111-4111-8111-111111111111';
const DOCTOR_B = '22222222-2222-4222-8222-222222222222';

function doctor(id: string, displayName: string): Doctor {
  return {
    id,
    displayName,
    specialty: 'Odontología general',
    bio: 'Una bio larga que no hace falta mandarle al modelo',
    photoUrl: 'https://x/foto.jpg',
    displayOrder: 0,
    isBookable: true,
  };
}

function treatment(overrides: Partial<PricedTreatment>): PricedTreatment {
  return {
    id: 't1',
    code: 'limpieza',
    name: 'Limpieza',
    description: 'Profilaxis dental',
    basePrice: 150,
    estimatedMinutes: 30,
    applicationType: 'general',
    currency: 'BOB',
    categoryId: 'c1',
    categoryCode: 'basicos',
    categoryName: 'Básicos',
    categoryColor: '#000000',
    displayOrder: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    basePriceBob: null,
    ...overrides,
  };
}

/** Fecha YYYY-MM-DD de dentro de `days` días, en UTC (alcanza para quedar en el futuro). */
function futureDate(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

describe('public tools', () => {
  const doctorRepo = {
    findBookable: jest.fn(),
    isBookable: jest.fn(),
  };
  const appointmentsService = {
    getAvailabilityRange: jest.fn(),
    getAvailability: jest.fn(),
  };
  const treatmentsService = { findActive: jest.fn() };
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env['FRONTEND_URL'];
    doctorRepo.findBookable.mockResolvedValue([
      doctor(DOCTOR_A, 'Dr. Saul Guizada'),
      doctor(DOCTOR_B, 'Dra. Marylu Aliaga'),
    ]);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('exporta las seis tools públicas de la matriz', () => {
    expect(PUBLIC_TOOLS).toHaveLength(6);
  });

  describe('get_clinic_info', () => {
    it('devuelve los datos de contacto', async () => {
      await expect(new GetClinicInfoTool().execute()).resolves.toBe(
        CLINIC_INFO,
      );
    });
  });

  describe('get_faq', () => {
    const tool = new GetFaqTool();

    it('sin tema devuelve todas las preguntas, solo pregunta y respuesta', async () => {
      const faq = (await tool.execute(anonymous, {})) as object[];

      expect(faq).toHaveLength(CLINIC_FAQ.length);
      expect(faq[0]).toEqual({
        question: CLINIC_FAQ[0].question,
        answer: CLINIC_FAQ[0].answer,
      });
    });

    it('filtra por tema', async () => {
      const faq = (await tool.execute(anonymous, {
        topic: 'pagos',
      })) as object[];

      expect(faq).toHaveLength(
        CLINIC_FAQ.filter((entry) => entry.topic === 'pagos').length,
      );
    });
  });

  describe('list_services', () => {
    const tool = () =>
      new ListServicesTool(treatmentsService as unknown as TreatmentsService);

    beforeEach(() => {
      treatmentsService.findActive.mockResolvedValue([
        treatment({ name: 'Limpieza', categoryName: 'Básicos' }),
        treatment({
          name: 'Implante',
          categoryName: 'Cirugía oral',
          currency: 'USD',
          basePrice: 800,
          basePriceBob: 5568,
          description: 'x'.repeat(300),
        }),
      ]);
    });

    it('devuelve nombre, categoría, descripción acotada y precio en bolivianos', async () => {
      const result = (await tool().execute(anonymous, {})) as {
        services: Array<Record<string, unknown>>;
        note: string;
      };

      expect(result.services[0]).toEqual({
        name: 'Limpieza',
        category: 'Básicos',
        description: 'Profilaxis dental',
        priceBob: 150,
      });
      expect(result.services[1]).toMatchObject({
        name: 'Implante',
        priceBob: 5568,
        originalPrice: 800,
        originalCurrency: 'USD',
      });
      expect(result.services[1].description as string).toHaveLength(200);
      expect(result.note).toContain('referenciales');
    });

    it('filtra por categoría sin distinguir tildes ni mayúsculas', async () => {
      const result = (await tool().execute(anonymous, {
        category: 'CIRUGIA',
      })) as { services: Array<{ name: string }> };

      expect(result.services.map((s) => s.name)).toEqual(['Implante']);
    });

    it('tolera tratamientos sin descripción', async () => {
      treatmentsService.findActive.mockResolvedValue([
        treatment({ description: null }),
      ]);

      const result = (await tool().execute(anonymous, {})) as {
        services: Array<{ description: string | null }>;
      };

      expect(result.services[0].description).toBeNull();
    });
  });

  describe('list_doctors', () => {
    it('devuelve id, nombre y especialidad (sin bio ni foto)', async () => {
      const tool = new ListDoctorsTool(doctorRepo);

      await expect(tool.execute()).resolves.toEqual([
        {
          doctorId: DOCTOR_A,
          name: 'Dr. Saul Guizada',
          specialty: 'Odontología general',
        },
        {
          doctorId: DOCTOR_B,
          name: 'Dra. Marylu Aliaga',
          specialty: 'Odontología general',
        },
      ]);
    });
  });

  describe('get_available_slots', () => {
    const tool = () =>
      new GetAvailableSlotsTool(
        appointmentsService as unknown as AppointmentsService,
        doctorRepo,
      );

    beforeEach(() => {
      appointmentsService.getAvailabilityRange.mockImplementation(
        (_doctorId: string, from: string) =>
          Promise.resolve({
            from,
            days: 2,
            slotsByDate: {
              '2026-10-05': [
                '2026-10-05T13:00:00.000Z',
                '2026-10-05T13:30:00.000Z',
                '2026-10-05T14:00:00.000Z',
                '2026-10-05T14:30:00.000Z',
                '2026-10-05T15:00:00.000Z',
                '2026-10-05T15:30:00.000Z',
                '2026-10-05T19:00:00.000Z',
              ],
              '2026-10-06': [],
            },
          }),
      );
    });

    it('sin doctorId consulta todos los doctores reservables', async () => {
      const from = futureDate(3);

      const result = (await tool().execute(anonymous, { from })) as unknown[];

      expect(result).toHaveLength(2);
      expect(appointmentsService.getAvailabilityRange).toHaveBeenCalledWith(
        DOCTOR_A,
        from,
        7,
      );
      expect(appointmentsService.getAvailabilityRange).toHaveBeenCalledWith(
        DOCTOR_B,
        from,
        7,
      );
    });

    it('resume por día: cantidad y los primeros 6 horarios en hora de Bolivia, sin días vacíos', async () => {
      const result = (await tool().execute(anonymous, {
        doctorId: DOCTOR_A,
        from: futureDate(3),
        days: 2,
      })) as Array<Record<string, unknown>>;

      expect(result).toEqual([
        {
          doctorId: DOCTOR_A,
          doctorName: 'Dr. Saul Guizada',
          days: [
            {
              date: '2026-10-05',
              available: 7,
              firstTimes: [
                '09:00',
                '09:30',
                '10:00',
                '10:30',
                '11:00',
                '11:30',
              ],
            },
          ],
        },
      ]);
    });

    it('rechaza una fecha pasada', async () => {
      await expect(
        tool().execute(anonymous, { from: '2020-01-01' }),
      ).resolves.toEqual({ error: 'date_in_past' });
      expect(appointmentsService.getAvailabilityRange).not.toHaveBeenCalled();
    });

    it('un doctorId que no es reservable da doctor_not_found', async () => {
      await expect(
        tool().execute(anonymous, {
          doctorId: '33333333-3333-4333-8333-333333333333',
          from: futureDate(1),
        }),
      ).resolves.toEqual({ error: 'doctor_not_found' });
    });
  });

  describe('get_booking_link', () => {
    const tool = () =>
      new GetBookingLinkTool(
        appointmentsService as unknown as AppointmentsService,
      );
    const SLOT = '2026-10-05T13:00:00.000Z';

    it('convierte la hora local de Bolivia (UTC-4) y arma el link a /reservar con FRONTEND_URL', async () => {
      process.env['FRONTEND_URL'] = 'https://clinica.example.com';
      appointmentsService.getAvailability.mockResolvedValue({
        date: '2026-10-05',
        slots: [SLOT],
      });

      const result = await tool().execute(anonymous, {
        doctorId: DOCTOR_A,
        date: '2026-10-05',
        time: '09:00',
      });

      expect(appointmentsService.getAvailability).toHaveBeenCalledWith(
        DOCTOR_A,
        '2026-10-05',
      );
      // La URL no va al modelo: viaja como link aparte.
      expect(result).toBeInstanceOf(ToolOutputWithLinks);
      const output = result as ToolOutputWithLinks;
      expect(output.links).toEqual([
        {
          label: 'Completar reserva y pago (05/10, 09:00)',
          url: `https://clinica.example.com/reservar?slot=${encodeURIComponent(SLOT)}&doctorId=${DOCTOR_A}`,
        },
      ]);
      expect(output.data).toMatchObject({ date: '2026-10-05', time: '09:00' });
      expect(JSON.stringify(output.data)).not.toContain('http');
    });

    it('usa localhost:4200 si FRONTEND_URL no está seteada', async () => {
      appointmentsService.getAvailability.mockResolvedValue({
        date: '2026-10-05',
        slots: [SLOT],
      });

      const result = (await tool().execute(anonymous, {
        doctorId: DOCTOR_A,
        date: '2026-10-05',
        time: '09:00',
      })) as ToolOutputWithLinks;

      expect(
        result.links[0].url.startsWith('http://localhost:4200/reservar?'),
      ).toBe(true);
    });

    it('no da link para un horario ocupado o fuera de la grilla', async () => {
      appointmentsService.getAvailability.mockResolvedValue({
        date: '2026-10-05',
        slots: ['2026-10-05T14:00:00.000Z'],
      });

      await expect(
        tool().execute(anonymous, {
          doctorId: DOCTOR_A,
          date: '2026-10-05',
          time: '09:00',
        }),
      ).resolves.toEqual({ error: 'slot_unavailable' });
    });

    it('interpreta la hora como hora de Bolivia, no UTC (el bug que se vio en vivo)', async () => {
      // 10:00 en La Paz = 14:00 UTC. Si se tomara como UTC, no coincidiría.
      appointmentsService.getAvailability.mockResolvedValue({
        date: '2026-09-26',
        slots: ['2026-09-26T14:00:00.000Z'],
      });

      const result = (await tool().execute(anonymous, {
        doctorId: DOCTOR_A,
        date: '2026-09-26',
        time: '10:00',
      })) as ToolOutputWithLinks;

      expect(result.links[0].url).toContain(
        encodeURIComponent('2026-09-26T14:00:00.000Z'),
      );
    });
  });

  describe('validación de argumentos', () => {
    const validator = new ClassValidatorToolArgsValidator();

    it('get_available_slots rechaza más de 14 días y un formato de fecha inválido', async () => {
      const tool = new GetAvailableSlotsTool(
        appointmentsService as unknown as AppointmentsService,
        doctorRepo,
      );

      await expect(
        validator.validate(tool.argsDto, { from: futureDate(1), days: 15 }),
      ).resolves.toEqual({ ok: false, fields: ['days'] });
      await expect(
        validator.validate(tool.argsDto, { from: '5/10/2026' }),
      ).resolves.toEqual({ ok: false, fields: ['from'] });
    });

    it('get_booking_link exige un doctorId UUID, fecha YYYY-MM-DD y hora HH:mm', async () => {
      const tool = new GetBookingLinkTool(
        appointmentsService as unknown as AppointmentsService,
      );

      await expect(
        validator.validate(tool.argsDto, {
          doctorId: 'x',
          date: 'mañana',
          time: '25:00',
        }),
      ).resolves.toEqual({ ok: false, fields: ['doctorId', 'date', 'time'] });
      await expect(
        validator.validate(tool.argsDto, {
          doctorId: DOCTOR_A,
          date: '2026-09-26',
          time: '10:00',
        }),
      ).resolves.toMatchObject({ ok: true });
    });

    it('las tools sin argumentos aceptan {} y rechazan cualquier campo', async () => {
      const tool = new GetClinicInfoTool();

      await expect(validator.validate(tool.argsDto, {})).resolves.toMatchObject(
        {
          ok: true,
        },
      );
      await expect(
        validator.validate(tool.argsDto, { userId: 'alguien' }),
      ).resolves.toEqual({ ok: false, fields: ['userId'] });
    });

    it('get_faq solo acepta temas conocidos', async () => {
      await expect(
        validator.validate(new GetFaqTool().argsDto, {
          topic: 'precios secretos',
        }),
      ).resolves.toEqual({ ok: false, fields: ['topic'] });
    });
  });
});
