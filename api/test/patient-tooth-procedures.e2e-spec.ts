import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { AccessTokenVerifier } from '../src/auth/domain/AccessTokenVerifier';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { FakeAccessTokenVerifier } from './support/fake-access-token-verifier';
import { randomUUID } from 'node:crypto';

/**
 * Historial de tratamientos del propio paciente (CLI-102): el dashboard del
 * paciente no puede usar GET /patients/:patientId/tooth-procedures (solo
 * odontólogos) — usa GET /patients/me/tooth-procedures, que resuelve la
 * ficha por sesión y nunca por parámetro.
 */

// Datos propios (no los del chatbot): jest corre los e2e en paralelo y dos
// suites que limpian el mismo dominio de email se pisan entre sí.
const FIXTURE_DOMAIN = '@e2e-cli102.test';
const CATEGORY_CODE = 'e2e_cli102';
const TREATMENT_CODE = 'e2e_cli102_treatment';

interface FixtureUser {
  id: string;
  authUserId: string;
  token: string;
}

interface ProcedureBody {
  patientId: string;
  toothNumber: number | null;
}

describe('Historial de tratamientos del paciente (e2e) — CLI-102', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let doctor: FixtureUser;
  let patientA: FixtureUser & { patientId: string };
  let patientB: FixtureUser & { patientId: string };
  const verifier = new FakeAccessTokenVerifier();

  async function cleanupFixtures(): Promise<void> {
    await prisma.tooth_procedures.deleteMany({
      where: { treatments: { code: TREATMENT_CODE } },
    });
    await prisma.treatments.deleteMany({ where: { code: TREATMENT_CODE } });
    await prisma.treatment_categories.deleteMany({
      where: { code: CATEGORY_CODE },
    });
    await prisma.patients.deleteMany({
      where: { users: { email: { endsWith: FIXTURE_DOMAIN } } },
    });
    await prisma.users.deleteMany({
      where: { email: { endsWith: FIXTURE_DOMAIN } },
    });
  }

  async function createUser(
    key: string,
    role: 'patient' | 'odontologist',
  ): Promise<FixtureUser> {
    const authUserId = randomUUID();
    const user = await prisma.users.create({
      data: {
        auth_user_id: authUserId,
        email: `${key}${FIXTURE_DOMAIN}`,
        role,
      },
    });
    verifier.register(`token-${key}`, authUserId);
    return { id: user.id, authUserId, token: `token-${key}` };
  }

  async function createPatient(
    key: string,
  ): Promise<FixtureUser & { patientId: string }> {
    const user = await createUser(key, 'patient');
    const patient = await prisma.patients.create({
      data: { user_id: user.id, first_name: key, last_name_paternal: 'E2E' },
    });
    return { ...user, patientId: patient.id };
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
    await cleanupFixtures();
    doctor = await createUser('doctor', 'odontologist');
    patientA = await createPatient('patient-a');
    patientB = await createPatient('patient-b');

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
          patient_id: patientA.patientId,
          tooth_number: 11,
          treatment_id: treatment.id,
          price_charged: 100,
          performed_by: doctor.id,
        },
        {
          patient_id: patientB.patientId,
          tooth_number: 21,
          treatment_id: treatment.id,
          price_charged: 100,
          performed_by: doctor.id,
        },
      ],
    });
  });

  afterAll(async () => {
    await cleanupFixtures();
    await app.close();
  });

  it('el paciente ve solo sus propios procedimientos en /patients/me/tooth-procedures', async () => {
    const res = await request(app.getHttpServer())
      .get('/patients/me/tooth-procedures')
      .set('Authorization', `Bearer ${patientA.token}`)
      .expect(200);

    const body = res.body as ProcedureBody[];
    expect(body).toHaveLength(1);
    expect(body[0].patientId).toBe(patientA.patientId);
    expect(body[0].toothNumber).toBe(11);
  });

  it('un paciente sigue recibiendo 403 en el endpoint parametrizado, incluso con su propio id', async () => {
    await request(app.getHttpServer())
      .get(`/patients/${patientA.patientId}/tooth-procedures`)
      .set('Authorization', `Bearer ${patientA.token}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/patients/${patientB.patientId}/tooth-procedures`)
      .set('Authorization', `Bearer ${patientA.token}`)
      .expect(403);
  });

  it('un odontólogo no usa el endpoint "me" (no es paciente)', async () => {
    await request(app.getHttpServer())
      .get('/patients/me/tooth-procedures')
      .set('Authorization', `Bearer ${doctor.token}`)
      .expect(403);
  });
});
