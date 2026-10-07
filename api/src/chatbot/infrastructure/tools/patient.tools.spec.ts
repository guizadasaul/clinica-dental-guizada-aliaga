import { UserRole } from '../../../auth/domain/value-objects/UserRole';
import type { AppointmentsService } from '../../../appointments/application/appointments.service';
import type { PatientAppointment } from '../../../appointments/domain/PatientAppointment';
import type { QuotesService } from '../../../quotes/application/quotes.service';
import type { Quote } from '../../../quotes/domain/Quote';
import type { QuoteLine } from '../../../quotes/domain/QuoteBalance';
import type { PatientsService } from '../../../patients/application/patients.service';
import type {
  FinancesService,
  QrChargeView,
} from '../../../finances/application/finances.service';
import { ToolOutputWithLinks } from '../../domain/ChatLink';
import type { ToothProcedure } from '../../../patients/domain/ToothProcedure';
import type { ChatActor } from '../../domain/ChatActor';
import { ClassValidatorToolArgsValidator } from './class-validator-tool-args.validator';
import {
  CancelMyQrPaymentTool,
  CheckMyQrPaymentTool,
  CreateMyQrPaymentTool,
  GetMyAppointmentsTool,
  GetMyBalanceTool,
  GetMyNextAppointmentTool,
  GetMyPendingTreatmentsTool,
  GetMyQuotesTool,
  GetMyTreatmentsTool,
  GetMyVisitsTool,
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

function line(overrides: Partial<QuoteLine> = {}): QuoteLine {
  return {
    key: '11111111-1111-4111-8111-111111111111',
    treatmentName: 'Limpieza',
    toothNumbers: [],
    total: 250,
    paid: 100,
    pending: 150,
    performedAt: null,
    ...overrides,
  };
}

function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: 'quote-1',
    patientId: 'patient-1',
    totalAmount: 400,
    totalPaid: 100,
    balance: 300,
    status: 'partially_paid',
    notes: 'nota interna que no debe salir',
    createdAt: new Date('2026-09-01T15:00:00Z'),
    updatedAt: new Date('2026-09-01T15:00:00Z'),
    sharedAt: new Date('2026-09-01T15:00:00Z'),
    items: [],
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
        allocations: [],
        covered: [],
      },
    ],
    lines: [
      line(),
      line({
        key: '22222222-2222-4222-8222-222222222222',
        treatmentName: 'Resina',
        toothNumbers: [11, 12],
        total: 150,
        paid: 0,
        pending: 150,
      }),
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
    treatmentName: 'Resina',
    priceCharged: 300,
    quantity: 1,
    procedureDate: new Date('2026-09-10T12:00:00Z'),
    surfaces: [],
    notes: 'nota clínica',
    performedBy: 'doctor-1',
    createdAt: new Date('2026-09-10T12:00:00Z'),
    ...overrides,
  } as ToothProcedure;
}

function visit(date: string, status: string): PatientAppointment {
  return {
    id: `v-${date}`,
    appointmentDatetime: new Date(`${date}T14:00:00Z`),
    durationMinutes: 30,
    doctorName: 'Dra. Lucía Rojas',
    treatmentName: 'Limpieza',
    status,
  };
}

describe('patient tools (CLI-91, CLI-235)', () => {
  const appointmentsService = {
    getPatientAppointments: jest.fn(),
    getPatientVisits: jest.fn(),
  };
  const quotesService = { findSharedByPatient: jest.fn() };
  const patientsService = { findToothProcedures: jest.fn() };
  const financesService = {
    getPendingPatientQrCharge: jest.fn(),
    createPatientQrCharge: jest.fn(),
    verifyPatientQrCharge: jest.fn(),
    cancelPatientQrCharge: jest.fn(),
  };
  const finances = financesService as unknown as FinancesService;
  const appointments = appointmentsService as unknown as AppointmentsService;
  const quotes = quotesService as unknown as QuotesService;
  const patients = patientsService as unknown as PatientsService;

  beforeEach(() => jest.clearAllMocks());

  it('exporta las 10 tools del paciente', () => {
    expect(PATIENT_TOOLS).toHaveLength(10);
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
      'get_my_visits',
      () =>
        new GetMyVisitsTool(appointments).execute(patientWithoutProfile, {}),
    ],
    [
      'get_my_quotes',
      () => new GetMyQuotesTool(quotes).execute(patientWithoutProfile),
    ],
    [
      'get_my_balance',
      () => new GetMyBalanceTool(quotes).execute(patientWithoutProfile),
    ],
    [
      'get_my_treatments',
      () =>
        new GetMyTreatmentsTool(patients).execute(patientWithoutProfile, {}),
    ],
    [
      'get_my_pending_treatments',
      () =>
        new GetMyPendingTreatmentsTool(quotes).execute(patientWithoutProfile),
    ],
    [
      'create_my_qr_payment',
      () =>
        new CreateMyQrPaymentTool(quotes, finances).execute(
          patientWithoutProfile,
          {},
        ),
    ],
    [
      'check_my_qr_payment',
      () => new CheckMyQrPaymentTool(finances).execute(patientWithoutProfile),
    ],
    [
      'cancel_my_qr_payment',
      () => new CancelMyQrPaymentTool(finances).execute(patientWithoutProfile),
    ],
  ])('%s', (_name, run) => {
    it('sin ficha de paciente responde no_patient_profile sin consultar nada', async () => {
      await expect(run()).resolves.toMatchObject({
        error: 'no_patient_profile',
      });
      expect(appointmentsService.getPatientAppointments).not.toHaveBeenCalled();
      expect(appointmentsService.getPatientVisits).not.toHaveBeenCalled();
      expect(quotesService.findSharedByPatient).not.toHaveBeenCalled();
      expect(patientsService.findToothProcedures).not.toHaveBeenCalled();
      expect(financesService.getPendingPatientQrCharge).not.toHaveBeenCalled();
      expect(financesService.createPatientQrCharge).not.toHaveBeenCalled();
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
        weekday: 'lunes',
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

  describe('get_my_visits', () => {
    it('incluye las citas a las que no asistió y dice cuántas fueron', async () => {
      appointmentsService.getPatientVisits.mockResolvedValue([
        visit('2026-10-05', 'no_show'),
        visit('2026-10-03', 'confirmed'),
        visit('2026-09-01', 'attended'),
      ]);

      const result = await new GetMyVisitsTool(appointments).execute(patient, {
        limit: 2,
      });

      expect(appointmentsService.getPatientVisits).toHaveBeenCalledWith(
        'patient-1',
      );
      expect(result).toMatchObject({
        total: 3,
        missed: 1,
        visits: [
          {
            date: '2026-10-05',
            weekday: 'lunes',
            time: '10:00',
            doctor: 'Dra. Lucía Rojas',
            attended: false,
          },
          { date: '2026-10-03', weekday: 'sábado', attended: true },
        ],
      });
      expect(JSON.stringify(result)).not.toContain('v-2026');
    });
  });

  describe('get_my_quotes', () => {
    it('numera presupuestos y líneas, con lo pagado y lo pendiente de cada una, sin notas ni ids', async () => {
      quotesService.findSharedByPatient.mockResolvedValue([quote()]);

      const result = await new GetMyQuotesTool(quotes).execute(patient);

      expect(quotesService.findSharedByPatient).toHaveBeenCalledWith(
        'patient-1',
      );
      expect(result).toEqual({
        total: 1,
        quotes: [
          {
            quote: 1,
            date: '2026-09-01',
            status: 'pago parcial',
            totalBob: 400,
            paidBob: 100,
            balanceBob: 300,
            lines: [
              {
                line: 1,
                treatment: 'Limpieza',
                totalBob: 250,
                paidBob: 100,
                pendingBob: 150,
                status: 'por realizar',
              },
              {
                line: 2,
                treatment: 'Resina',
                teeth: [11, 12],
                totalBob: 150,
                paidBob: 0,
                pendingBob: 150,
                status: 'por realizar',
              },
            ],
            payments: [
              { date: '2026-09-02', amountBob: 100, receipt: 'REC-000123' },
            ],
          },
        ],
        note: expect.stringContaining('create_my_qr_payment') as unknown,
      });
      const json = JSON.stringify(result);
      expect(json).not.toContain('nota');
      expect(json).not.toContain('quote-1');
      expect(json).not.toContain('patient-1');
      // Las keys de las líneas son UUIDs: el LLM elige por número (CLI-235).
      expect(json).not.toContain('11111111-');
    });

    // CLI-226: el paciente pregunta "¿qué me falta hacerme?".
    it('marca cada tratamiento como realizado (con fecha) o por realizar', async () => {
      quotesService.findSharedByPatient.mockResolvedValue([
        quote({
          lines: [
            line({ performedAt: new Date('2026-04-22T12:00:00Z') }),
            line(),
          ],
        }),
      ]);

      const {
        quotes: [first],
      } = (await new GetMyQuotesTool(quotes).execute(patient)) as {
        quotes: Array<{ lines: Array<{ status: string }> }>;
      };

      expect(first.lines.map((l) => l.status)).toEqual([
        'realizado el 2026-04-22',
        'por realizar',
      ]);
    });

    it('devuelve pagados y con pago parcial juntos, como máximo 5 (el bug que se vio en vivo)', async () => {
      quotesService.findSharedByPatient.mockResolvedValue([
        quote({ status: 'partially_paid' }),
        ...Array.from({ length: 5 }, () => quote({ status: 'paid' })),
      ]);

      const result = (await new GetMyQuotesTool(quotes).execute(patient)) as {
        total: number;
        quotes: Array<{ quote: number; status: string }>;
      };

      expect(result.quotes).toHaveLength(5);
      expect(result.total).toBe(6);
      expect(result.quotes.map((q) => q.quote)).toEqual([1, 2, 3, 4, 5]);
      expect(result.quotes[0].status).toBe('pago parcial');
    });

    it('muestra el estado crudo si no tiene traducción', async () => {
      quotesService.findSharedByPatient.mockResolvedValue([
        quote({ status: 'raro' }),
      ]);

      const {
        quotes: [first],
      } = (await new GetMyQuotesTool(quotes).execute(patient)) as {
        quotes: Array<{ status: string }>;
      };

      expect(first.status).toBe('raro');
    });
  });

  describe('get_my_balance', () => {
    it('suma los saldos de los presupuestos compartidos', async () => {
      quotesService.findSharedByPatient.mockResolvedValue([
        quote({ balance: 300 }),
        quote({ balance: 150.555 }),
        quote({ balance: 0, status: 'paid' }),
      ]);

      await expect(
        new GetMyBalanceTool(quotes).execute(patient),
      ).resolves.toEqual({
        totalBalanceBob: 450.56,
        quotesWithBalance: 2,
        note: expect.stringContaining('create_my_qr_payment') as unknown,
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
          treatmentName: 'Brackets',
        }),
        procedure({
          id: 'p2',
          applicationGroupId: 'g1',
          toothNumber: 32,
          treatmentName: 'Brackets',
        }),
        procedure({ id: 'p3', toothNumber: null, treatmentName: 'Limpieza' }),
      ]);

      const result = await new GetMyTreatmentsTool(patients).execute(
        patient,
        {},
      );

      expect(patientsService.findToothProcedures).toHaveBeenCalledWith(
        'patient-1',
      );
      expect(result).toEqual({
        total: 2,
        treatments: [
          { date: '2026-09-10', treatment: 'Brackets', teeth: [31, 32] },
          { date: '2026-09-10', treatment: 'Limpieza' },
        ],
      });
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

      const result = (await new GetMyTreatmentsTool(patients).execute(patient, {
        limit: 2,
      })) as { total: number; treatments: unknown[] };

      // Muestra 2 pero dice que hay 3 (CLI-145: "te muestro 2 de 3").
      expect(result.treatments).toHaveLength(2);
      expect(result.total).toBe(3);
    });
  });

  describe('get_my_pending_treatments', () => {
    it('lista lo que falta realizar o pagar, con el número de presupuesto y de línea', async () => {
      quotesService.findSharedByPatient.mockResolvedValue([
        quote({
          lines: [
            // Realizada y pagada: no falta nada.
            line({
              performedAt: new Date('2026-09-10T12:00:00Z'),
              paid: 250,
              pending: 0,
            }),
            // Realizada pero con saldo: falta pagarla.
            line({
              treatmentName: 'Resina',
              performedAt: new Date('2026-09-10T12:00:00Z'),
            }),
            // Pagada pero por realizar: falta hacerla.
            line({ treatmentName: 'Endodoncia', paid: 250, pending: 0 }),
          ],
        }),
      ]);

      const result = (await new GetMyPendingTreatmentsTool(quotes).execute(
        patient,
      )) as { treatments: unknown[]; note: string };

      expect(result.treatments).toEqual([
        {
          quote: 1,
          line: 2,
          treatment: 'Resina',
          totalBob: 250,
          paidBob: 100,
          pendingBob: 150,
          status: 'realizado el 2026-09-10',
        },
        {
          quote: 1,
          line: 3,
          treatment: 'Endodoncia',
          totalBob: 250,
          paidBob: 250,
          pendingBob: 0,
          status: 'por realizar',
        },
      ]);
      expect(result.note).toContain('create_my_qr_payment');
    });
  });

  describe('pago con QR (CLI-236)', () => {
    const KEY_1 = '11111111-1111-4111-8111-111111111111';
    const KEY_2 = '22222222-2222-4222-8222-222222222222';
    const KEY_3 = '33333333-3333-4333-8333-333333333333';
    const carlaQuote = () =>
      quote({
        id: 'quote-carla',
        balance: 1050,
        lines: [
          line({
            key: KEY_1,
            treatmentName: 'Limpieza',
            paid: 150,
            pending: 0,
          }),
          line({
            key: KEY_2,
            treatmentName: 'Resina',
            toothNumbers: [16],
            paid: 150,
            pending: 50,
          }),
          line({
            key: KEY_3,
            treatmentName: 'Endodoncia',
            paid: 0,
            pending: 800,
          }),
        ],
      });
    const view = (overrides: Partial<QrChargeView> = {}): QrChargeView => ({
      chargeId: 'charge-1',
      quoteId: 'quote-carla',
      amount: 850,
      qrImageBase64: 'iVBORw0KGgoQR',
      status: 'pending',
      lines: [
        { lineKey: KEY_2, amount: 50 },
        { lineKey: KEY_3, amount: 800 },
      ],
      ...overrides,
    });
    const create = () => new CreateMyQrPaymentTool(quotes, finances);

    beforeEach(() => {
      quotesService.findSharedByPatient.mockResolvedValue([carlaQuote()]);
      financesService.getPendingPatientQrCharge.mockResolvedValue(null);
      financesService.createPatientQrCharge.mockResolvedValue(view());
    });

    it('sin líneas genera el QR por todo lo pendiente, con el patientId del actor', async () => {
      const result = await create().execute(patient, {});

      expect(financesService.createPatientQrCharge).toHaveBeenCalledWith(
        'patient-1',
        'quote-carla',
        [KEY_2, KEY_3],
      );
      expect(result).toBeInstanceOf(ToolOutputWithLinks);
      const output = result as ToolOutputWithLinks;
      expect(output.attachments).toEqual([
        {
          type: 'qr_payment',
          chargeId: 'charge-1',
          amountBob: 850,
          imageBase64: 'iVBORw0KGgoQR',
          lines: [
            { treatment: 'Resina', amountBob: 50 },
            { treatment: 'Endodoncia', amountBob: 800 },
          ],
        },
      ]);
      // El modelo ve el monto y qué cubre; nunca la imagen ni el id del cobro.
      expect(output.data).toMatchObject({
        amountBob: 850,
        expiresInMinutes: 30,
      });
      const forModel = JSON.stringify(output.data);
      expect(forModel).not.toContain('charge-1');
      expect(forModel).not.toContain('iVBORw0KGgoQR');
      expect(forModel).not.toContain(KEY_2);
    });

    it('con números de línea paga solo esas', async () => {
      await create().execute(patient, { lines: [3] });

      expect(financesService.createPatientQrCharge).toHaveBeenCalledWith(
        'patient-1',
        'quote-carla',
        [KEY_3],
      );
    });

    it('rechaza líneas que no existen o que ya están pagadas, sin generar nada', async () => {
      await expect(
        create().execute(patient, { lines: [3, 9] }),
      ).resolves.toMatchObject({ error: 'invalid_line', lines: [9] });
      await expect(
        create().execute(patient, { lines: [1] }),
      ).resolves.toMatchObject({ error: 'line_already_paid', lines: [1] });
      expect(financesService.createPatientQrCharge).not.toHaveBeenCalled();
    });

    it('sin saldo no genera nada', async () => {
      quotesService.findSharedByPatient.mockResolvedValue([
        quote({ balance: 0, status: 'paid' }),
      ]);

      await expect(create().execute(patient, {})).resolves.toMatchObject({
        error: 'no_balance',
      });
      expect(financesService.createPatientQrCharge).not.toHaveBeenCalled();
    });

    it('si ya tiene un QR pendiente devuelve ese en vez de fallar', async () => {
      financesService.getPendingPatientQrCharge.mockResolvedValue(view());

      const result = (await create().execute(patient, {
        lines: [3],
      })) as ToolOutputWithLinks;

      expect(financesService.createPatientQrCharge).not.toHaveBeenCalled();
      expect(result.attachments[0].chargeId).toBe('charge-1');
      expect(result.data).toMatchObject({ alreadyPending: true });
    });

    describe('check_my_qr_payment', () => {
      const check = () => new CheckMyQrPaymentTool(finances);

      it('sin QR pendiente lo dice', async () => {
        await expect(check().execute(patient)).resolves.toMatchObject({
          noPendingQr: true,
        });
        expect(financesService.verifyPatientQrCharge).not.toHaveBeenCalled();
      });

      it('verifica el QR pendiente del paciente y da el saldo nuevo si se pagó', async () => {
        financesService.getPendingPatientQrCharge.mockResolvedValue(view());
        financesService.verifyPatientQrCharge.mockResolvedValue({
          status: 'paid',
          quote: quote({ balance: 200 }),
        });

        await expect(check().execute(patient)).resolves.toMatchObject({
          status: 'paid',
          amountBob: 850,
          balanceBob: 200,
        });
        expect(financesService.verifyPatientQrCharge).toHaveBeenCalledWith(
          'patient-1',
          'charge-1',
        );
      });

      it.each([
        ['pending', 'pending'],
        ['cancelled', 'cancelled'],
      ])('banco %s → %s', async (bank, status) => {
        financesService.getPendingPatientQrCharge.mockResolvedValue(view());
        financesService.verifyPatientQrCharge.mockResolvedValue({
          status: bank,
        });

        await expect(check().execute(patient)).resolves.toMatchObject({
          status,
        });
      });
    });

    describe('cancel_my_qr_payment', () => {
      const cancel = () => new CancelMyQrPaymentTool(finances);

      it('anula el QR pendiente del paciente', async () => {
        financesService.getPendingPatientQrCharge.mockResolvedValue(view());
        financesService.cancelPatientQrCharge.mockResolvedValue({
          status: 'cancelled',
        });

        await expect(cancel().execute(patient)).resolves.toEqual({
          status: 'cancelled',
          note: 'QR anulado.',
        });
        expect(financesService.cancelPatientQrCharge).toHaveBeenCalledWith(
          'patient-1',
          'charge-1',
        );
      });

      it('si ya estaba pagado lo dice y da el saldo (CLI-220: anular nunca pierde un pago)', async () => {
        financesService.getPendingPatientQrCharge.mockResolvedValue(view());
        financesService.cancelPatientQrCharge.mockResolvedValue({
          status: 'paid',
          quote: quote({ balance: 0 }),
        });

        await expect(cancel().execute(patient)).resolves.toMatchObject({
          status: 'paid',
          balanceBob: 0,
        });
      });

      it('sin QR pendiente no anula nada', async () => {
        await expect(cancel().execute(patient)).resolves.toMatchObject({
          noPendingQr: true,
        });
        expect(financesService.cancelPatientQrCharge).not.toHaveBeenCalled();
      });
    });

    it('las tools de QR tienen un tope de tiempo mayor (llaman a BANECO)', () => {
      expect(create().timeoutMs).toBeGreaterThan(5_000);
      expect(new CheckMyQrPaymentTool(finances).timeoutMs).toBeGreaterThan(
        5_000,
      );
    });

    it('el pago se elige por número: nunca acepta keys ni ids', async () => {
      const validator = new ClassValidatorToolArgsValidator();
      await expect(
        validator.validate(create().argsDto, { lines: [KEY_2] }),
      ).resolves.toMatchObject({ ok: false });
      await expect(
        validator.validate(create().argsDto, { quoteId: 'quote-otro' }),
      ).resolves.toEqual({ ok: false, fields: ['quoteId'] });
      await expect(
        validator.validate(create().argsDto, { quote: 1, lines: [2, 3] }),
      ).resolves.toMatchObject({ ok: true });
    });
  });

  describe('validación de argumentos', () => {
    const validator = new ClassValidatorToolArgsValidator();

    it('ninguna tool del paciente acepta un patientId', async () => {
      const appointmentsTool = new GetMyAppointmentsTool(appointments);
      const quotesTool = new GetMyQuotesTool(quotes);
      const nextTool = new GetMyNextAppointmentTool(appointments);
      const visitsTool = new GetMyVisitsTool(appointments);

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
      await expect(
        validator.validate(visitsTool.argsDto, { patientId: 'otro' }),
      ).resolves.toEqual({ ok: false, fields: ['patientId'] });
    });

    it('valida scope y límites', async () => {
      await expect(
        validator.validate(new GetMyAppointmentsTool(appointments).argsDto, {
          scope: 'todas',
          limit: 50,
        }),
      ).resolves.toEqual({ ok: false, fields: ['scope', 'limit'] });
      await expect(
        validator.validate(new GetMyTreatmentsTool(patients).argsDto, {
          limit: 0,
        }),
      ).resolves.toEqual({ ok: false, fields: ['limit'] });
      await expect(
        validator.validate(new GetMyVisitsTool(appointments).argsDto, {
          limit: 21,
        }),
      ).resolves.toEqual({ ok: false, fields: ['limit'] });
    });
  });
});
