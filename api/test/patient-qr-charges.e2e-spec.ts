import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { AccessTokenVerifier } from '../src/auth/domain/AccessTokenVerifier';
import {
  PaymentGateway,
  type QrStatus,
} from '../src/payments/domain/PaymentGateway';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { FakeAccessTokenVerifier } from './support/fake-access-token-verifier';

/**
 * El paciente paga con QR BANECO los tratamientos que elige (CLI-218):
 * solo sobre sus presupuestos compartidos, por todo lo pendiente de lo que
 * eligió, y el pago queda asignado a esos tratamientos.
 */

// Datos propios: jest corre los e2e en paralelo (ver CLI-102).
const DOMAIN = '@e2e-cli218.test';
const CATEGORY_CODE = 'e2e_cli218';
const TREATMENT_CODE = 'e2e_cli218_treatment';

interface QuoteLineBody {
  key: string;
  pending: number;
  paid: number;
}
interface QuoteBody {
  id: string;
  lines: QuoteLineBody[];
  payments: { covered: { lineKey: string; amount: number }[] }[];
}
interface ChargeBody {
  chargeId: string;
  amount: number;
  lines: { lineKey: string; amount: number }[];
}

describe('QR BANECO del paciente (e2e) — CLI-218', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const verifier = new FakeAccessTokenVerifier();
  let qrStatus: QrStatus = 'pending';
  const gateway = {
    generateQr: jest.fn(() =>
      Promise.resolve({ qrId: `qr-${randomUUID()}`, qrImageBase64: 'img' }),
    ),
    getQrStatus: jest.fn(() =>
      Promise.resolve({ status: qrStatus, payment: null }),
    ),
    cancelQr: jest.fn(() => Promise.resolve()),
  };
  let quoteA: string;
  let quoteB: string;
  let itemKey: string;
  let groupKey: string;

  async function cleanup(): Promise<void> {
    const quotes = { patients: { users: { email: { endsWith: DOMAIN } } } };
    await prisma.quote_qr_charges.deleteMany({ where: { quotes } });
    await prisma.payments.deleteMany({ where: { quotes } });
    await prisma.quote_items.deleteMany({ where: { quotes } });
    await prisma.application_groups.deleteMany({
      where: { treatments: { code: TREATMENT_CODE } },
    });
    await prisma.quotes.deleteMany({ where: quotes });
    await prisma.treatments.deleteMany({ where: { code: TREATMENT_CODE } });
    await prisma.treatment_categories.deleteMany({
      where: { code: CATEGORY_CODE },
    });
    await prisma.patients.deleteMany({
      where: { users: { email: { endsWith: DOMAIN } } },
    });
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
    verifier.register(`token-218-${key}`, authUserId);
    return user.id;
  }

  async function createPatientWithQuote(
    key: string,
    treatmentId: string,
  ): Promise<string> {
    const userId = await createUser(key, 'patient');
    const patient = await prisma.patients.create({
      data: { user_id: userId, first_name: key, last_name_paternal: 'E2E' },
    });
    const quote = await prisma.quotes.create({
      data: {
        patient_id: patient.id,
        total_amount: 700,
        shared_at: new Date(),
      },
    });
    await prisma.quote_items.create({
      data: {
        quote_id: quote.id,
        treatment_id: treatmentId,
        unit_price: 300,
        subtotal: 300,
        tooth_number: 16,
      },
    });
    const group = await prisma.application_groups.create({
      data: { treatment_id: treatmentId, unit_price: 400, subtotal: 400 },
    });
    await prisma.quote_items.createMany({
      data: [21, 22].map((tooth) => ({
        quote_id: quote.id,
        treatment_id: treatmentId,
        tooth_number: tooth,
        application_group_id: group.id,
      })),
    });
    return quote.id;
  }

  const as = (key: string) => ({ Authorization: `Bearer token-218-${key}` });

  async function myQuote(): Promise<QuoteBody> {
    const res = await request(app.getHttpServer())
      .get('/patients/me/quotes')
      .set(as('patient-a'))
      .expect(200);
    return (res.body as QuoteBody[]).find((q) => q.id === quoteA)!;
  }

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AccessTokenVerifier)
      .useValue(verifier)
      .overrideProvider(PaymentGateway)
      .useValue(gateway)
      .compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    await cleanup();

    await createUser('doctor', 'odontologist');
    const category = await prisma.treatment_categories.create({
      data: {
        code: CATEGORY_CODE,
        name: 'Categoría E2E CLI-218',
        display_order: 999,
        color: '#000000',
      },
    });
    const treatment = await prisma.treatments.create({
      data: {
        code: TREATMENT_CODE,
        name: 'Tratamiento E2E CLI-218',
        base_price: 100,
        category_id: category.id,
      },
    });
    quoteA = await createPatientWithQuote('patient-a', treatment.id);
    quoteB = await createPatientWithQuote('patient-b', treatment.id);
    const lines = (await myQuote()).lines;
    itemKey = lines.find((l) => l.pending === 300)!.key;
    groupKey = lines.find((l) => l.pending === 400)!.key;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('el presupuesto del paciente trae lo pendiente por tratamiento', async () => {
    expect(
      (await myQuote()).lines.map((l) => l.pending).toSorted((a, b) => a - b),
    ).toEqual([300, 400]);
  });

  it('nadie más puede generar un QR sobre su presupuesto', async () => {
    const body = { lineKeys: [itemKey] };
    await request(app.getHttpServer())
      .post(`/patients/me/quotes/${quoteA}/qr-charges`)
      .set(as('patient-b'))
      .send(body)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/patients/me/quotes/${quoteA}/qr-charges`)
      .set(as('doctor'))
      .send(body)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/patients/me/quotes/${quoteA}/qr-charges`)
      .set(as('patient-a'))
      .send({ lineKeys: [] })
      .expect(400);
    expect(gateway.generateQr).not.toHaveBeenCalled();
  });

  it('genera, retoma, verifica y asigna el pago a los tratamientos elegidos', async () => {
    const created = await request(app.getHttpServer())
      .post(`/patients/me/quotes/${quoteA}/qr-charges`)
      .set(as('patient-a'))
      .send({ lineKeys: [groupKey] })
      .expect(201);
    const charge = created.body as ChargeBody;
    expect(charge.amount).toBe(400);
    expect(charge.lines).toEqual([{ lineKey: groupKey, amount: 400 }]);

    // Un solo QR pendiente a la vez, y se puede retomar.
    await request(app.getHttpServer())
      .post(`/patients/me/quotes/${quoteA}/qr-charges`)
      .set(as('patient-a'))
      .send({ lineKeys: [itemKey] })
      .expect(409);
    const pending = await request(app.getHttpServer())
      .get('/patients/me/qr-charges/pending')
      .set(as('patient-a'))
      .expect(200);
    expect((pending.body as ChargeBody).chargeId).toBe(charge.chargeId);

    // Otro paciente no puede verificarlo ni anularlo.
    await request(app.getHttpServer())
      .post(`/patients/me/qr-charges/${charge.chargeId}/verify`)
      .set(as('patient-b'))
      .expect(404);
    await request(app.getHttpServer())
      .post(`/patients/me/qr-charges/${charge.chargeId}/cancel`)
      .set(as('patient-b'))
      .expect(404);

    qrStatus = 'pending';
    const notYet = await request(app.getHttpServer())
      .post(`/patients/me/qr-charges/${charge.chargeId}/verify`)
      .set(as('patient-a'))
      .expect(200);
    expect(notYet.body).toEqual({ status: 'pending' });

    qrStatus = 'paid';
    const paid = await request(app.getHttpServer())
      .post(`/patients/me/qr-charges/${charge.chargeId}/verify`)
      .set(as('patient-a'))
      .expect(200);
    const quote = (paid.body as { status: string; quote: QuoteBody }).quote;
    // Lo pagado cubre el grupo elegido, no el primer tratamiento del presupuesto.
    expect(quote.lines.find((l) => l.key === groupKey)?.pending).toBe(0);
    expect(quote.lines.find((l) => l.key === itemKey)?.pending).toBe(300);
    expect(quote.payments[0].covered).toEqual([
      expect.objectContaining({ lineKey: groupKey, amount: 400 }),
    ]);

    // Ya no hay QR pendiente, y lo pagado no se puede volver a cobrar.
    const none = await request(app.getHttpServer())
      .get('/patients/me/qr-charges/pending')
      .set(as('patient-a'))
      .expect(200);
    expect(none.body).toEqual({});
    await request(app.getHttpServer())
      .post(`/patients/me/quotes/${quoteA}/qr-charges`)
      .set(as('patient-a'))
      .send({ lineKeys: [groupKey] })
      .expect(422);
  });

  it('anula su QR pendiente y puede generar otro', async () => {
    const created = await request(app.getHttpServer())
      .post(`/patients/me/quotes/${quoteB}/qr-charges`)
      .set(as('patient-b'))
      .send({
        lineKeys: [
          (
            await prisma.quote_items.findFirstOrThrow({
              where: { quote_id: quoteB, application_group_id: null },
            })
          ).id,
        ],
      })
      .expect(201);
    const chargeId = (created.body as ChargeBody).chargeId;

    await request(app.getHttpServer())
      .post(`/patients/me/qr-charges/${chargeId}/cancel`)
      .set(as('patient-b'))
      .expect(204);
    expect(gateway.cancelQr).toHaveBeenCalled();
    const none = await request(app.getHttpServer())
      .get('/patients/me/qr-charges/pending')
      .set(as('patient-b'))
      .expect(200);
    expect(none.body).toEqual({});
  });
});
