import { UserRole } from '../../../auth/domain/value-objects/UserRole';
import type { AppointmentsService } from '../../../appointments/application/appointments.service';
import type { QuotesService } from '../../../quotes/application/quotes.service';
import type { Quote } from '../../../quotes/domain/Quote';
import type { QuoteItem } from '../../../quotes/domain/QuoteItem';
import type { PatientsService } from '../../../patients/application/patients.service';
import type { ToothProcedure } from '../../../patients/domain/ToothProcedure';
import type { ITreatmentRepository } from '../../../treatments/domain/TreatmentRepository';
import type { ChatActor } from '../../domain/ChatActor';
import { ClassValidatorToolArgsValidator } from './class-validator-tool-args.validator';
import {
  GetMyAppointmentsTool,
  GetMyBalanceTool,
  GetMyNextAppointmentTool,
  GetMyPendingTreatmentsTool,
  GetMyQuotesTool,
  GetMyTreatmentsTool,
  PATIENT_TOOLS,
} from './patient.tools';

const patient: ChatActor = {
  kind: 'user',
  userId: 'user-1',
  role: UserRole.PATIENT,
  patientId: 'patient-1',
};
const patientWithoutProfile: ChatActor = { ...patient, patientId: null };
const anonymous: ChatActor = { kind: 'anonymous' };

// 10:00 en La Paz.
const APPOINTMENT_AT = new Date('2026-09-28T14:00:00Z');

function item(overrides: Partial<QuoteItem> = {}): QuoteItem {
  return {
    id: 'item-1',
    quoteId: 'quote-1',
    treatmentId: 't-limpieza',
    toothNumber: null,
    applicationGroupId: null,
    unitPrice: 250,
    quantity: 1,
    subtotal: 250,
    currency: 'BOB',
    exchangeRate: null,
    ...overrides,
  };
}

function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: 'quote-1',
    patientId: 'patient-1',
    totalAmount: 400,
    totalPaid: 100,
    status: 'partially_paid',
    notes: 'nota interna que no debe salir',
    createdAt: new Date('2026-09-01T15:00:00Z'),
    updatedAt: new Date('2026-09-01T15:00:00Z'),
    items: [item()],
    payments: [
      {
        id: 'pay-1',
        quoteId: 'quote-1',
        amount: 100,
        paymentMethod: 'efectivo',
        receiptNumber: 'REC-000123',
        paymentDate: new Date('2026-09-02T15:00:00Z'),
        notes: 'nota del pago',
        createdAt: new Date('2026-09-02T15:00:00Z'),
      },
    ],
    ...overrides,
  };
}

function procedure(overrides: Partial<ToothProcedure> = {}): ToothProcedure {
  return {
    id: 'proc-1',
    patientId: 'patient-1',
    toothNumber: 16,
    applicationGroupId: null,
    treatmentId: 't-resina',
    priceCharged: 300,
    quantity: 1,
    procedureDate: new Date('2026-09-10T12:00:00Z'),
    surfaces: [],
    notes: 'nota clínica',
    performedBy: 'doctor-1',
    createdAt: new Date('2026-09-10T12:00:00Z'),
    ...overrides,
  };
}

describe('patient tools (CLI-91)', () => {
  const appointmentsService = { getPatientAppointments: jest.fn() };
  const quotesService = { findByPatient: jest.fn() };
  const patientsService = { findToothProcedures: jest.fn() };
  const treatmentRepo = {
    findById: jest.fn((id: string) =>
      Promise.resolve(
        (
          {
            't-limpieza': { name: 'Limpieza' },
            't-resina': { name: 'Resina' },
            't-ortodoncia': { name: 'Brackets' },
          } as Record<string, { name: string }>
        )[id] ?? null,
      ),
    ),
  };
  const appointments = appointmentsService as unknown as AppointmentsService;
  const quotes = quotesService as unknown as QuotesService;
  const patients = patientsService as unknown as PatientsService;
  const treatments = treatmentRepo as unknown as ITreatmentRepository;

  beforeEach(() => jest.clearAllMocks());

  it('exporta las 6 tools del paciente', () => {
    expect(PATIENT_TOOLS).toHaveLength(6);
  });

  describe.each([
    [
      'get_my_next_appointment',
      () =>
        new GetMyNextAppointmentTool(appointments).execute(
          patientWithoutProfile,
        ),
    ],
    [
      'get_my_appointments',
      () =>
        new GetMyAppointmentsTool(appointments).execute(patientWithoutProfile, {
          scope: 'upcoming',
        }),
    ],
    [
      'get_my_quotes',
      () =>
        new GetMyQuotesTool(quotes, treatments).execute(
          patientWithoutProfile,
          {},
        ),
    ],
    [
      'get_my_balance',
      () => new GetMyBalanceTool(quotes).execute(patientWithoutProfile),
    ],
    [
      'get_my_treatments',
      () =>
        new GetMyTreatmentsTool(patients, treatments).execute(
          patientWithoutProfile,
          {},
        ),
    ],
    [
      'get_my_pending_treatments',
      () =>
        new GetMyPendingTreatmentsTool(quotes, treatments).execute(
          patientWithoutProfile,
        ),
    ],
  ])('%s', (_name, run) => {
    it('sin ficha de paciente responde no_patient_profile sin consultar nada', async () => {
      await expect(run()).resolves.toMatchObject({
        error: 'no_patient_profile',
      });
      expect(appointmentsService.getPatientAppointments).not.toHaveBeenCalled();
      expect(quotesService.findByPatient).not.toHaveBeenCalled();
      expect(patientsService.findToothProcedures).not.toHaveBeenCalled();
    });
  });

  it('un actor anónimo tampoco obtiene nada (defensa extra además de la matriz)', async () => {
    await expect(
      new GetMyBalanceTool(quotes).execute(anonymous),
    ).resolves.toMatchObject({ error: 'no_patient_profile' });
  });

  describe('get_my_next_appointment', () => {
    it('consulta con el patientId del actor y responde en hora de Bolivia', async () => {
      appointmentsService.getPatientAppointments.mockResolvedValue([
        {
          id: 'appt-1',
          appointmentDatetime: APPOINTMENT_AT,
          durationMinutes: 30,
          doctorName: 'Dr. Ariel Guizada',
          treatmentName: 'Consulta',
        },
      ]);

      const result = await new GetMyNextAppointmentTool(appointments).execute(
        patient,
      );

      expect(appointmentsService.getPatientAppointments).toHaveBeenCalledWith(
        'patient-1',
        'upcoming',
        1,
      );
      expect(result).toEqual({
        date: '2026-09-28',
        time: '10:00',
        doctor: 'Dr. Ariel Guizada',
        treatment: 'Consulta',
        durationMinutes: 30,
      });
      expect(JSON.stringify(result)).not.toContain('appt-1');
    });

    it('sin citas próximas lo dice', async () => {
      appointmentsService.getPatientAppointments.mockResolvedValue([]);

      await expect(
        new GetMyNextAppointmentTool(appointments).execute(patient),
      ).resolves.toMatchObject({ none: true });
    });
  });

  describe('get_my_appointments', () => {
    it('usa el scope pedido y 5 por defecto', async () => {
      appointmentsService.getPatientAppointments.mockResolvedValue([]);

      await expect(
        new GetMyAppointmentsTool(appointments).execute(patient, {
          scope: 'past',
        }),
      ).resolves.toEqual({ scope: 'past', appointments: [] });
      expect(appointmentsService.getPatientAppointments).toHaveBeenCalledWith(
        'patient-1',
        'past',
        5,
      );
    });

    it('respeta el límite pedido', async () => {
      appointmentsService.getPatientAppointments.mockResolvedValue([]);

      await new GetMyAppointmentsTool(appointments).execute(patient, {
        scope: 'upcoming',
        limit: 2,
      });

      expect(appointmentsService.getPatientAppointments).toHaveBeenCalledWith(
        'patient-1',
        'upcoming',
        2,
      );
    });
  });

  describe('get_my_quotes', () => {
    it('devuelve total, pagado, saldo, ítems con nombre y pagos con recibo, sin notas ni ids', async () => {
      quotesService.findByPatient.mockResolvedValue([quote()]);

      const result = await new GetMyQuotesTool(quotes, treatments).execute(
        patient,
        {},
      );

      expect(quotesService.findByPatient).toHaveBeenCalledWith('patient-1');
      expect(result).toEqual([
        {
          date: '2026-09-01',
          status: 'pago parcial',
          totalBob: 400,
          paidBob: 100,
          balanceBob: 300,
          items: [{ treatment: 'Limpieza', subtotalBob: 250 }],
          payments: [
            { date: '2026-09-02', amountBob: 100, receipt: 'REC-000123' },
          ],
        },
      ]);
      const json = JSON.stringify(result);
      expect(json).not.toContain('nota');
      expect(json).not.toContain('quote-1');
      expect(json).not.toContain('patient-1');
    });

    it('agrupa una aplicación en varias piezas en una sola línea con su precio una vez', async () => {
      quotesService.findByPatient.mockResolvedValue([
        quote({
          items: [
            item({
              id: 'a',
              treatmentId: 't-resina',
              toothNumber: 11,
              applicationGroupId: 'g1',
              subtotal: 600,
            }),
            item({
              id: 'b',
              treatmentId: 't-resina',
              toothNumber: 12,
              applicationGroupId: 'g1',
              subtotal: 600,
            }),
          ],
        }),
      ]);

      const [first] = (await new GetMyQuotesTool(quotes, treatments).execute(
        patient,
        {},
      )) as Array<{
        items: unknown[];
      }>;

      expect(first.items).toEqual([
        { treatment: 'Resina', teeth: [11, 12], subtotalBob: 600 },
      ]);
    });

    it('devuelve pagados y con pago parcial juntos, como máximo 5 (el bug que se vio en vivo)', async () => {
      quotesService.findByPatient.mockResolvedValue([
        quote({ status: 'partially_paid' }),
        ...Array.from({ length: 5 }, () => quote({ status: 'paid' })),
      ]);

      const result = (await new GetMyQuotesTool(quotes, treatments).execute(
        patient,
      )) as Array<{ status: string }>;

      expect(result).toHaveLength(5);
      expect(result[0].status).toBe('pago parcial');
    });

    it('nombra genérico un tratamiento desconocido', async () => {
      quotesService.findByPatient.mockResolvedValue([
        quote({ items: [item({ treatmentId: 'desconocido' })] }),
      ]);

      const [first] = (await new GetMyQuotesTool(quotes, treatments).execute(
        patient,
      )) as Array<{ items: Array<{ treatment: string }> }>;

      expect(first.items[0].treatment).toBe('Tratamiento');
    });

    it('muestra el estado crudo si no tiene traducción', async () => {
      quotesService.findByPatient.mockResolvedValue([
        quote({ status: 'raro' }),
      ]);

      const [first] = (await new GetMyQuotesTool(quotes, treatments).execute(
        patient,
        {},
      )) as Array<{
        status: string;
      }>;

      expect(first.status).toBe('raro');
    });
  });

  describe('get_my_balance', () => {
    it('suma los saldos sin pagar y no cuenta sobrepagos como negativos', async () => {
      quotesService.findByPatient.mockResolvedValue([
        quote({ totalAmount: 400, totalPaid: 100 }),
        quote({ totalAmount: 150.555, totalPaid: 0 }),
        quote({ totalAmount: 100, totalPaid: 120, status: 'paid' }),
      ]);

      await expect(
        new GetMyBalanceTool(quotes).execute(patient),
      ).resolves.toEqual({
        totalBalanceBob: 450.56,
        quotesWithBalance: 2,
      });
    });
  });

  describe('get_my_treatments', () => {
    it('lista procedimientos con fecha, nombre y piezas, agrupando aplicaciones, sin precio ni notas', async () => {
      patientsService.findToothProcedures.mockResolvedValue([
        procedure({
          id: 'p1',
          applicationGroupId: 'g1',
          toothNumber: 31,
          treatmentId: 't-ortodoncia',
        }),
        procedure({
          id: 'p2',
          applicationGroupId: 'g1',
          toothNumber: 32,
          treatmentId: 't-ortodoncia',
        }),
        procedure({ id: 'p3', toothNumber: null, treatmentId: 't-limpieza' }),
      ]);

      const result = await new GetMyTreatmentsTool(
        patients,
        treatments,
      ).execute(patient, {});

      expect(patientsService.findToothProcedures).toHaveBeenCalledWith(
        'patient-1',
      );
      expect(result).toEqual([
        { date: '2026-09-10', treatment: 'Brackets', teeth: [31, 32] },
        { date: '2026-09-10', treatment: 'Limpieza' },
      ]);
      const json = JSON.stringify(result);
      expect(json).not.toContain('300');
      expect(json).not.toContain('nota');
    });

    it('respeta el límite', async () => {
      patientsService.findToothProcedures.mockResolvedValue([
        procedure({ id: 'a' }),
        procedure({ id: 'b' }),
        procedure({ id: 'c' }),
      ]);

      const result = (await new GetMyTreatmentsTool(
        patients,
        treatments,
      ).execute(patient, {
        limit: 2,
      })) as unknown[];

      expect(result).toHaveLength(2);
    });

    it('nombra genérico un tratamiento que ya no existe', async () => {
      patientsService.findToothProcedures.mockResolvedValue([
        procedure({ treatmentId: 'borrado' }),
      ]);

      const [first] = (await new GetMyTreatmentsTool(
        patients,
        treatments,
      ).execute(patient, {})) as Array<{
        treatment: string;
      }>;

      expect(first.treatment).toBe('Tratamiento');
    });
  });

  describe('get_my_pending_treatments', () => {
    it('lista los ítems de presupuestos sin pagar por completo, con la aclaración', async () => {
      quotesService.findByPatient.mockResolvedValue([
        quote({ status: 'paid', items: [item({ treatmentId: 't-limpieza' })] }),
        quote({
          status: 'pending',
          items: [item({ treatmentId: 't-resina', toothNumber: 26 })],
        }),
      ]);

      const result = (await new GetMyPendingTreatmentsTool(
        quotes,
        treatments,
      ).execute(patient)) as {
        treatments: unknown[];
        note: string;
      };

      expect(result.treatments).toEqual([
        { treatment: 'Resina', teeth: [26], subtotalBob: 250 },
      ]);
      expect(result.note).toContain('presupuestos');
    });
  });

  describe('validación de argumentos', () => {
    const validator = new ClassValidatorToolArgsValidator();

    it('ninguna tool del paciente acepta un patientId', async () => {
      const appointmentsTool = new GetMyAppointmentsTool(appointments);
      const quotesTool = new GetMyQuotesTool(quotes, treatments);
      const nextTool = new GetMyNextAppointmentTool(appointments);

      await expect(
        validator.validate(appointmentsTool.argsDto, {
          scope: 'upcoming',
          patientId: 'otro',
        }),
      ).resolves.toEqual({ ok: false, fields: ['patientId'] });
      await expect(
        validator.validate(quotesTool.argsDto, { patientId: 'otro' }),
      ).resolves.toEqual({ ok: false, fields: ['patientId'] });
      await expect(
        validator.validate(quotesTool.argsDto, { status: 'pending' }),
      ).resolves.toEqual({ ok: false, fields: ['status'] });
      await expect(
        validator.validate(nextTool.argsDto, { userId: 'otro' }),
      ).resolves.toEqual({ ok: false, fields: ['userId'] });
    });

    it('valida scope, límites y estado', async () => {
      await expect(
        validator.validate(new GetMyAppointmentsTool(appointments).argsDto, {
          scope: 'todas',
          limit: 50,
        }),
      ).resolves.toEqual({ ok: false, fields: ['scope', 'limit'] });
      await expect(
        validator.validate(new GetMyQuotesTool(quotes, treatments).argsDto, {
          status: 'x',
        }),
      ).resolves.toEqual({ ok: false, fields: ['status'] });
      await expect(
        validator.validate(
          new GetMyTreatmentsTool(patients, treatments).argsDto,
          { limit: 0 },
        ),
      ).resolves.toEqual({ ok: false, fields: ['limit'] });
    });
  });
});
