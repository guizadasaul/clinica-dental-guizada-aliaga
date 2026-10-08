import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { AccessTokenVerifier } from '../src/auth/domain/AccessTokenVerifier';
import {
  BookingConfirmationRepository,
  type IBookingConfirmationRepository,
} from '../src/payments/domain/BookingConfirmationRepository';
import {
  WebConsultationRepository,
  type IWebConsultationRepository,
} from '../src/payments/domain/WebConsultationRepository';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { FakeAccessTokenVerifier } from './support/fake-access-token-verifier';

/**
 * La consulta reservada y pagada por la web en el presupuesto (CLI-257):
 * confirmar el pago suma la línea con el pago aplicado a ella (no FIFO a lo
 * más viejo), el presupuesto queda compartido, la consulta pasa a realizada
 * cuando la cita ya pasó y deja de estarlo con "No asistió".
 */

const DOMAIN = '@e2e-cli257.test';
const CATEGORY_CODE = 'e2e_cli257';
const TREATMENT_CODE = 'e2e_cli257_consulta';

interface QuoteLineBody {
  key: string;
  treatmentName: string;
  total: number;
  paid: number;
  pending: number;
  performedAt: string | null;
}
interface QuoteBody {
  id: string;
  sharedAt: string | null;
  totalPaid: number;
  lines: QuoteLineBody[];
}

describe('Consulta web en el presupuesto (e2e) — CLI-257', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let confirmations: IBookingConfirmationRepository;
  let webConsultations: IWebConsultationRepository;
  const verifier = new FakeAccessTokenVerifier();
  let doctorId: string;
  let treatmentId: string;

  const patients = { users: { email: { endsWith: DOMAIN } } };

  async function cleanup(): Promise<void> {
    await prisma.tooth_procedures.deleteMany({ where: { patients } });
    await prisma.appointments.deleteMany({
      where: {
        OR: [{ guest_email: { endsWith: DOMAIN } }, { patients }],
      },
    });
    const quotes = { patients };
    await prisma.payments.deleteMany({ where: { quotes } });
    await prisma.quote_items.deleteMany({ where: { quotes } });
    await prisma.quotes.deleteMany({ where: quotes });
    await prisma.treatments.deleteMany({ where: { code: TREATMENT_CODE } });
    await prisma.treatment_categories.deleteMany({
      where: { code: CATEGORY_CODE },
    });
    await prisma.patients.deleteMany({ where: patients });
    await prisma.users.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  }

  async function createUser(
    key: string,
    role: 'patient' | 'odontologist',
  ): Promise<string> {
    const authUserId = randomUUID();
    const user = await prisma.users.create({
      data: {
        auth_user_id: authUserId,
        email: `${key}${DOMAIN}`,
        role,
        display_name: key,
      },
    });
    verifier.register(`token-257-${key}`, authUserId);
    return user.id;
  }

  /** Una reserva web retenida (held) a la hora indicada, como queda antes de pagar. */
  async function heldBooking(email: string, at: Date): Promise<string> {
    const appointment = await prisma.appointments.create({
      data: {
        doctor_id: doctorId,
        appointment_datetime: at,
        status: 'held',
        source: 'public_web',
        guest_first_name: 'Ana',
        guest_last_name_paternal: 'Web',
        guest_phone: `+5917${Math.floor(1000000 + Math.random() * 8999999)}`,
        guest_email: email,
        hold_expires_at: new Date(Date.now() + 10 * 60_000),
      },
    });
    return appointment.id;
  }

  function confirm(appointmentId: string, email: string) {
    return confirmations.confirmPaidBooking({
      appointmentId,
      paidAt: new Date(),
      amount: 50,
      qrId: `qr-${randomUUID()}`,
      guestFirstName: 'Ana',
      guestLastNamePaternal: 'Web',
      guestLastNameMaternal: null,
      guestPhone: '+59170000257',
      guestEmail: email,
      treatmentId,
    });
  }

  async function quotesOf(key: string): Promise<QuoteBody[]> {
    const res = await request(app.getHttpServer())
      .get('/patients/me/quotes')
      .set({ Authorization: `Bearer token-257-${key}` })
      .expect(200);
    return res.body as QuoteBody[];
  }

  const consultLine = (quote: QuoteBody) =>
    quote.lines.find((l) => l.treatmentName === 'Consulta E2E CLI-257')!;

  beforeAll(async () => {
    // El barrido lo dispara cada test a mano.
    process.env['WEB_CONSULTATION_SYNC_INTERVAL_MS'] = '0';
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AccessTokenVerifier)
      .useValue(verifier)
      .compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    confirmations = moduleFixture.get(BookingConfirmationRepository);
    webConsultations = moduleFixture.get(WebConsultationRepository);
    await cleanup();

    doctorId = await createUser('doctor', 'odontologist');
    const category = await prisma.treatment_categories.create({
      data: {
        code: CATEGORY_CODE,
        name: 'Categoría E2E CLI-257',
        display_order: 999,
        color: '#000000',
      },
    });
    treatmentId = (
      await prisma.treatments.create({
        data: {
          code: TREATMENT_CODE,
          name: 'Consulta E2E CLI-257',
          base_price: 50,
          category_id: category.id,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('un paciente con presupuesto abierto: la consulta se suma pagada y el pago no se va a lo más viejo', async () => {
    const userId = await createUser('con-plan', 'patient');
    const patient = await prisma.patients.create({
      data: { user_id: userId, first_name: 'Con', last_name_paternal: 'Plan' },
    });
    // Borrador sin compartir con un tratamiento pendiente de Bs 300.
    const draft = await prisma.quotes.create({
      data: { patient_id: patient.id, total_amount: 300 },
    });
    await prisma.quote_items.create({
      data: {
        quote_id: draft.id,
        treatment_id: treatmentId,
        unit_price: 300,
        subtotal: 300,
        tooth_number: 16,
      },
    });
    const appointmentId = await heldBooking(
      `con-plan${DOMAIN}`,
      new Date(Date.now() + 24 * 60 * 60_000),
    );

    await confirm(appointmentId, `con-plan${DOMAIN}`);

    const [quote] = await quotesOf('con-plan');
    expect(quote.id).toBe(draft.id);
    expect(quote.sharedAt).not.toBeNull();
    expect(quote.totalPaid).toBe(50);
    // El plan viejo usa el mismo tratamiento: la consulta es la línea de Bs 50.
    expect(quote.lines.find((l) => l.total === 50)).toMatchObject({
      total: 50,
      paid: 50,
      pending: 0,
      performedAt: null,
    });
    // El tratamiento viejo sigue debiendo lo suyo entero.
    expect(quote.lines.find((l) => l.total === 300)?.pending).toBe(300);
    const appointment = await prisma.appointments.findUniqueOrThrow({
      where: { id: appointmentId },
    });
    expect(appointment.quote_item_id).not.toBeNull();
  });

  it('un paciente nuevo de la web: se le crea el presupuesto ya compartido', async () => {
    const appointmentId = await heldBooking(
      `nuevo${DOMAIN}`,
      new Date(Date.now() + 24 * 60 * 60_000),
    );

    const confirmed = await confirm(appointmentId, `nuevo${DOMAIN}`);

    const quotes = await prisma.quotes.findMany({
      where: { patient_id: confirmed!.patientId },
      include: { payments: true },
    });
    expect(quotes).toHaveLength(1);
    expect(quotes[0].shared_at).not.toBeNull();
    expect(Number(quotes[0].total_amount)).toBe(50);
    expect(Number(quotes[0].total_paid)).toBe(50);
    expect(quotes[0].status).toBe('paid');
    expect(quotes[0].payments).toEqual([
      expect.objectContaining({
        payment_method: 'qr_baneco',
        notes: 'Pago de la reserva web',
      }),
    ]);
  });

  it('un webhook repetido no suma otra línea ni otro pago', async () => {
    const appointmentId = await heldBooking(
      `doble${DOMAIN}`,
      new Date(Date.now() + 24 * 60 * 60_000),
    );
    const first = await confirm(appointmentId, `doble${DOMAIN}`);

    expect(await confirm(appointmentId, `doble${DOMAIN}`)).toBeNull();

    const items = await prisma.quote_items.count({
      where: { quotes: { patient_id: first!.patientId } },
    });
    const payments = await prisma.payments.count({
      where: { quotes: { patient_id: first!.patientId } },
    });
    expect([items, payments]).toEqual([1, 1]);
  });

  it('pasa a realizada cuando la cita pasó, y "No asistió" la desmarca (y desmarcarlo la vuelve a contar)', async () => {
    const userId = await createUser('realizada', 'patient');
    await prisma.patients.create({
      data: {
        user_id: userId,
        first_name: 'Rea',
        last_name_paternal: 'Lizada',
      },
    });
    const past = new Date(Date.now() - 2 * 60 * 60_000);
    const appointmentId = await heldBooking(`realizada${DOMAIN}`, past);
    await confirm(appointmentId, `realizada${DOMAIN}`);
    expect(
      consultLine((await quotesOf('realizada'))[0]).performedAt,
    ).toBeNull();

    const first = await webConsultations.sync(new Date());
    expect(first.performed).toBeGreaterThanOrEqual(1);
    expect(
      consultLine((await quotesOf('realizada'))[0]).performedAt,
    ).not.toBeNull();
    const procedures = await prisma.tooth_procedures.findMany({
      where: { patients: { user_id: userId } },
    });
    expect(procedures).toHaveLength(1);
    expect(procedures[0].performed_by).toBe(doctorId);

    // Idempotente: otro barrido no duplica.
    await webConsultations.sync(new Date());
    expect(
      await prisma.tooth_procedures.count({
        where: { patients: { user_id: userId } },
      }),
    ).toBe(1);

    await prisma.appointments.update({
      where: { id: appointmentId },
      data: { status: 'no_show' },
    });
    await webConsultations.sync(new Date());
    expect(
      consultLine((await quotesOf('realizada'))[0]).performedAt,
    ).toBeNull();

    await prisma.appointments.update({
      where: { id: appointmentId },
      data: { status: 'confirmed' },
    });
    await webConsultations.sync(new Date());
    expect(
      consultLine((await quotesOf('realizada'))[0]).performedAt,
    ).not.toBeNull();
  });

  it('una cita futura todavía no cuenta como realizada', async () => {
    const userId = await createUser('futura', 'patient');
    await prisma.patients.create({
      data: { user_id: userId, first_name: 'Fu', last_name_paternal: 'Tura' },
    });
    const appointmentId = await heldBooking(
      `futura${DOMAIN}`,
      new Date(Date.now() + 2 * 60 * 60_000),
    );
    await confirm(appointmentId, `futura${DOMAIN}`);

    await webConsultations.sync(new Date());

    expect(consultLine((await quotesOf('futura'))[0]).performedAt).toBeNull();
  });

  it('una cita marcada "Atendida" cuenta como realizada aunque sea más tarde', async () => {
    const userId = await createUser('atendida', 'patient');
    await prisma.patients.create({
      data: { user_id: userId, first_name: 'Aten', last_name_paternal: 'Dida' },
    });
    const appointmentId = await heldBooking(
      `atendida${DOMAIN}`,
      new Date(Date.now() + 30 * 60_000),
    );
    await confirm(appointmentId, `atendida${DOMAIN}`);
    await prisma.appointments.update({
      where: { id: appointmentId },
      data: { status: 'attended' },
    });

    await webConsultations.sync(new Date());

    expect(
      consultLine((await quotesOf('atendida'))[0]).performedAt,
    ).not.toBeNull();
  });
});
