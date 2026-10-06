import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { AccessTokenVerifier } from '../src/auth/domain/AccessTokenVerifier';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { FakeAccessTokenVerifier } from './support/fake-access-token-verifier';

/**
 * El presupuesto es el plan que el doctor cumple (CLI-226): registrar un
 * tratamiento del plan marca su línea como realizada; uno fuera del plan se
 * suma al presupuesto abierto, o a uno nuevo y compartido si no hay.
 */

// Datos propios: jest corre los e2e en paralelo (ver CLI-102).
const DOMAIN = '@e2e-cli226.test';
const CATEGORY_CODE = 'e2e_cli226';
const CODES = {
  single: 'e2e_cli226_single',
  group: 'e2e_cli226_group',
  general: 'e2e_cli226_general',
};

interface LineBody {
  key: string;
  toothNumbers: number[];
  total: number;
  performedAt: string | null;
}
interface QuoteBody {
  id: string;
  status: string;
  totalAmount: number;
  sharedAt: string | null;
  items: { id: string; procedureId: string | null }[];
  lines: LineBody[];
}

describe('El presupuesto como plan de tratamiento (e2e) — CLI-226', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const verifier = new FakeAccessTokenVerifier();
  let patientId: string;
  let quoteId: string;
  const treatment: Record<keyof typeof CODES, string> = {
    single: '',
    group: '',
    general: '',
  };

  async function cleanup(): Promise<void> {
    const ofFixture = { patients: { users: { email: { endsWith: DOMAIN } } } };
    await prisma.payments.deleteMany({ where: { quotes: ofFixture } });
    await prisma.tooth_procedures.deleteMany({ where: ofFixture });
    await prisma.quotes.deleteMany({ where: ofFixture });
    await prisma.application_groups.deleteMany({
      where: { treatments: { code: { in: Object.values(CODES) } } },
    });
    await prisma.treatments.deleteMany({
      where: { code: { in: Object.values(CODES) } },
    });
    await prisma.treatment_categories.deleteMany({
      where: { code: CATEGORY_CODE },
    });
    await prisma.dental_exams.deleteMany({ where: ofFixture });
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
    verifier.register(`token-226-${key}`, authUserId);
    return user.id;
  }

  const as = (key: string) => ({ Authorization: `Bearer token-226-${key}` });

  async function quotesOfPatient(): Promise<QuoteBody[]> {
    const res = await request(app.getHttpServer())
      .get(`/patients/${patientId}/quotes`)
      .set(as('doctor'))
      .expect(200);
    return res.body as QuoteBody[];
  }

  async function planQuote(): Promise<QuoteBody> {
    return (await quotesOfPatient()).find((q) => q.id === quoteId)!;
  }

  function register(body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(`/patients/${patientId}/tooth-procedures`)
      .set(as('doctor'))
      .send(body);
  }

  beforeAll(async () => {
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
    await cleanup();

    const doctorId = await createUser('doctor', 'odontologist');
    const patientUserId = await createUser('patient', 'patient');
    const patient = await prisma.patients.create({
      data: {
        user_id: patientUserId,
        first_name: 'Paciente',
        last_name_paternal: 'E2E',
      },
    });
    patientId = patient.id;
    await prisma.dental_exams.create({
      data: {
        patient_id: patientId,
        version: 1,
        kind: 'diagnosis',
        recorded_by: doctorId,
      },
    });

    const category = await prisma.treatment_categories.create({
      data: {
        code: CATEGORY_CODE,
        name: 'Categoría E2E CLI-226',
        display_order: 999,
        color: '#000000',
      },
    });
    const create = (
      key: keyof typeof CODES,
      type: 'single_tooth' | 'multiple_teeth' | 'general',
      price: number,
    ) =>
      prisma.treatments.create({
        data: {
          code: CODES[key],
          name: `E2E CLI-226 ${key}`,
          base_price: price,
          application_type: type,
          category_id: category.id,
        },
      });
    treatment.single = (await create('single', 'single_tooth', 300)).id;
    treatment.group = (await create('group', 'multiple_teeth', 400)).id;
    treatment.general = (await create('general', 'general', 350)).id;

    // El plan: conducto en la 14 (Bs 300) y un grupo en 16-17 (Bs 400).
    const quote = await prisma.quotes.create({
      data: { patient_id: patientId, total_amount: 700, shared_at: new Date() },
    });
    quoteId = quote.id;
    await prisma.quote_items.create({
      data: {
        quote_id: quoteId,
        treatment_id: treatment.single,
        tooth_number: 14,
        unit_price: 300,
        subtotal: 300,
      },
    });
    const group = await prisma.application_groups.create({
      data: {
        quote_id: quoteId,
        treatment_id: treatment.group,
        unit_price: 400,
        subtotal: 400,
      },
    });
    await prisma.quote_items.createMany({
      data: [16, 17].map((tooth) => ({
        quote_id: quoteId,
        treatment_id: treatment.group,
        tooth_number: tooth,
        application_group_id: group.id,
      })),
    });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('registrar lo que está en el plan marca la línea como realizada, sin cambiar el total', async () => {
    const res = await register({
      treatmentId: treatment.single,
      teeth: [{ number: 14 }],
      priceCharged: 300,
      procedureDate: '2026-10-01',
    }).expect(201);

    const quote = await planQuote();
    const line = quote.lines.find((l) => l.toothNumbers[0] === 14)!;
    expect(line.performedAt).not.toBeNull();
    expect(quote.totalAmount).toBe(700);
    expect((res.body as { quoteItemId: string }[])[0].quoteItemId).toBe(
      line.key,
    );
  });

  it('un grupo se cumple con las mismas piezas; si el doctor cobró otro precio, la línea lo toma', async () => {
    await register({
      treatmentId: treatment.group,
      teeth: [{ number: 17 }, { number: 16 }],
      priceCharged: 450,
    }).expect(201);

    const quote = await planQuote();
    const group = quote.lines.find((l) => l.toothNumbers.length === 2)!;
    expect(group.performedAt).not.toBeNull();
    expect(group.total).toBe(450);
    expect(quote.totalAmount).toBe(750);
  });

  it('lo que no estaba en el plan se suma al presupuesto abierto', async () => {
    await register({
      treatmentId: treatment.general,
      teeth: [],
      priceCharged: 350,
    }).expect(201);

    const quote = await planQuote();
    expect(quote.totalAmount).toBe(1100);
    expect(quote.lines).toHaveLength(3);
    expect(quote.items.every((i) => i.procedureId !== null)).toBe(true);
  });

  it('una línea realizada no se puede quitar del presupuesto (409)', async () => {
    const quote = await planQuote();
    await request(app.getHttpServer())
      .delete(`/quotes/${quoteId}/items/${quote.items[0].id}`)
      .set(as('doctor'))
      .expect(409);
    expect((await planQuote()).totalAmount).toBe(1100);
  });

  it('con el presupuesto pagado, lo nuevo va a otro presupuesto, compartido', async () => {
    await request(app.getHttpServer())
      .post(`/quotes/${quoteId}/payments`)
      .set(as('doctor'))
      .send({ amount: 1100 })
      .expect(201);
    expect((await planQuote()).status).toBe('paid');

    await register({
      treatmentId: treatment.single,
      teeth: [{ number: 15 }],
      priceCharged: 300,
    }).expect(201);

    const quotes = await quotesOfPatient();
    const paid = quotes.find((q) => q.id === quoteId)!;
    const created = quotes.find((q) => q.id !== quoteId)!;
    expect(paid).toMatchObject({ status: 'paid', totalAmount: 1100 });
    expect(created).toMatchObject({ status: 'pending', totalAmount: 300 });
    expect(created.sharedAt).not.toBeNull();
    expect(created.lines[0].performedAt).not.toBeNull();

    // Y el paciente lo ve en Mi presupuesto.
    const mine = await request(app.getHttpServer())
      .get('/patients/me/quotes')
      .set(as('patient'))
      .expect(200);
    expect((mine.body as QuoteBody[]).map((q) => q.id)).toContain(created.id);
  });
});
