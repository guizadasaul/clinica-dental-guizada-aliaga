import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { AccessTokenVerifier } from '../src/auth/domain/AccessTokenVerifier';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { FakeAccessTokenVerifier } from './support/fake-access-token-verifier';
import {
  type ChatbotFixtures,
  cleanupChatbotFixtures,
  createChatbotFixtures,
} from './fixtures/chatbot-fixtures';

/**
 * Historial de tratamientos del propio paciente (CLI-102): el dashboard del
 * paciente no puede usar GET /patients/:patientId/tooth-procedures (solo
 * odontólogos) — usa GET /patients/me/tooth-procedures, que resuelve la
 * ficha por sesión y nunca por parámetro.
 */

const CATEGORY_CODE = 'e2e_cli102';
const TREATMENT_CODE = 'e2e_cli102_treatment';

interface ProcedureBody {
  patientId: string;
  toothNumber: number | null;
}

describe('Historial de tratamientos del paciente (e2e) — CLI-102', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let fx: ChatbotFixtures;
  const verifier = new FakeAccessTokenVerifier();

  async function cleanupCatalog(): Promise<void> {
    await prisma.tooth_procedures.deleteMany({
      where: { treatments: { code: TREATMENT_CODE } },
    });
    await prisma.treatments.deleteMany({ where: { code: TREATMENT_CODE } });
    await prisma.treatment_categories.deleteMany({
      where: { code: CATEGORY_CODE },
    });
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
    await cleanupCatalog();
    fx = await createChatbotFixtures(prisma);
    for (const user of [fx.patientA, fx.patientB, fx.doctor1]) {
      verifier.register(user.token, user.authUserId);
    }

    const category = await prisma.treatment_categories.create({
      data: {
        code: CATEGORY_CODE,
        name: 'Categoría E2E CLI-102',
        display_order: 999,
        color: '#000000',
      },
    });
    const treatment = await prisma.treatments.create({
      data: {
        code: TREATMENT_CODE,
        name: 'Tratamiento E2E CLI-102',
        base_price: 100,
        category_id: category.id,
      },
    });
    await prisma.tooth_procedures.createMany({
      data: [
        {
          patient_id: fx.patientA.patientId,
          tooth_number: 11,
          treatment_id: treatment.id,
          price_charged: 100,
          performed_by: fx.doctor1.id,
        },
        {
          patient_id: fx.patientB.patientId,
          tooth_number: 21,
          treatment_id: treatment.id,
          price_charged: 100,
          performed_by: fx.doctor1.id,
        },
      ],
    });
  });

  afterAll(async () => {
    await cleanupCatalog();
    await cleanupChatbotFixtures(prisma);
    await app.close();
  });

  it('el paciente ve solo sus propios procedimientos en /patients/me/tooth-procedures', async () => {
    const res = await request(app.getHttpServer())
      .get('/patients/me/tooth-procedures')
      .set('Authorization', `Bearer ${fx.patientA.token}`)
      .expect(200);

    const body = res.body as ProcedureBody[];
    expect(body).toHaveLength(1);
    expect(body[0].patientId).toBe(fx.patientA.patientId);
    expect(body[0].toothNumber).toBe(11);
  });

  it('un paciente sigue recibiendo 403 en el endpoint parametrizado, incluso con su propio id', async () => {
    await request(app.getHttpServer())
      .get(`/patients/${fx.patientA.patientId}/tooth-procedures`)
      .set('Authorization', `Bearer ${fx.patientA.token}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/patients/${fx.patientB.patientId}/tooth-procedures`)
      .set('Authorization', `Bearer ${fx.patientA.token}`)
      .expect(403);
  });

  it('un odontólogo no usa el endpoint "me" (no es paciente)', async () => {
    await request(app.getHttpServer())
      .get('/patients/me/tooth-procedures')
      .set('Authorization', `Bearer ${fx.doctor1.token}`)
      .expect(403);
  });
});
