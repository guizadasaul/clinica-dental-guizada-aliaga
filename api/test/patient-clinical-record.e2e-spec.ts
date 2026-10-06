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
 * "Mi perfil" del paciente (CLI-213): GET /patients/me/clinical-record
 * devuelve la historia clínica inicial de la ficha de la sesión, nunca la de
 * otro paciente, y solo para el rol paciente.
 */

// Datos propios: jest corre los e2e en paralelo (ver CLI-102).
const FIXTURE_DOMAIN = '@e2e-cli213.test';

interface FixtureUser {
  id: string;
  authUserId: string;
  token: string;
}

interface ClinicalRecordBody {
  patient: { id: string; firstName: string };
  medicalHistory: { otherDiseases: string | null } | null;
  hygieneHabits: { brushingFrequency: string | null } | null;
  clinicalExam: { occlusion: string | null } | null;
  initialDiagnosis: {
    version: number;
    kind: string;
    recordedByName: string | null;
  } | null;
}

describe('Historia clínica inicial del paciente (e2e) — CLI-213', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let doctor: FixtureUser;
  let patientA: FixtureUser & { patientId: string };
  let patientB: FixtureUser & { patientId: string };
  let withoutRecord: FixtureUser;
  const verifier = new FakeAccessTokenVerifier();

  const fixturePatients = {
    patients: { users: { email: { endsWith: FIXTURE_DOMAIN } } },
  };

  async function cleanupFixtures(): Promise<void> {
    await prisma.dental_exams.deleteMany({ where: fixturePatients });
    await prisma.clinical_exams.deleteMany({ where: fixturePatients });
    await prisma.hygiene_habits.deleteMany({ where: fixturePatients });
    await prisma.medical_history.deleteMany({ where: fixturePatients });
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
        display_name: role === 'odontologist' ? 'Dra. E2E' : null,
      },
    });
    verifier.register(`token-213-${key}`, authUserId);
    return { id: user.id, authUserId, token: `token-213-${key}` };
  }

  async function createPatient(
    key: string,
    brushingFrequency: string,
  ): Promise<FixtureUser & { patientId: string }> {
    const user = await createUser(key, 'patient');
    const patient = await prisma.patients.create({
      data: { user_id: user.id, first_name: key, last_name_paternal: 'E2E' },
    });
    await prisma.medical_history.create({
      data: { patient_id: patient.id, other_diseases: `enfermedad ${key}` },
    });
    await prisma.hygiene_habits.create({
      data: { patient_id: patient.id, brushing_frequency: brushingFrequency },
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
    patientA = await createPatient('patient-a', 'twice_daily');
    patientB = await createPatient('patient-b', 'once_daily');
    withoutRecord = await createUser('sin-ficha', 'patient');

    // patient-a: dos exámenes clínicos (vale el más antiguo) y tres versiones
    // del examen dental (vale el primer diagnóstico desde cero).
    await prisma.clinical_exams.createMany({
      data: [
        {
          patient_id: patientA.patientId,
          occlusion: 'primera visita',
          exam_date: new Date('2025-03-14'),
        },
        {
          patient_id: patientA.patientId,
          occlusion: 'control',
          exam_date: new Date('2026-09-01'),
        },
      ],
    });
    await prisma.dental_exams.createMany({
      data: [
        {
          patient_id: patientA.patientId,
          version: 1,
          kind: 'diagnosis',
          recorded_by: doctor.id,
        },
        {
          patient_id: patientA.patientId,
          version: 2,
          kind: 'correction',
          recorded_by: doctor.id,
        },
        {
          patient_id: patientA.patientId,
          version: 3,
          kind: 'diagnosis',
          recorded_by: doctor.id,
        },
      ],
    });
  });

  afterAll(async () => {
    await cleanupFixtures();
    await app.close();
  });

  it('el paciente ve su propia historia inicial', async () => {
    const res = await request(app.getHttpServer())
      .get('/patients/me/clinical-record')
      .set('Authorization', `Bearer ${patientA.token}`)
      .expect(200);

    const body = res.body as ClinicalRecordBody;
    expect(body.patient.id).toBe(patientA.patientId);
    expect(body.medicalHistory?.otherDiseases).toBe('enfermedad patient-a');
    expect(body.hygieneHabits?.brushingFrequency).toBe('twice_daily');
    expect(body.clinicalExam?.occlusion).toBe('primera visita');
    expect(body.initialDiagnosis).toMatchObject({
      version: 1,
      kind: 'diagnosis',
      recordedByName: 'Dra. E2E',
    });
  });

  it('otro paciente ve solo lo suyo, nunca la ficha de patient-a', async () => {
    const res = await request(app.getHttpServer())
      .get('/patients/me/clinical-record')
      .set('Authorization', `Bearer ${patientB.token}`)
      .expect(200);

    const body = res.body as ClinicalRecordBody;
    expect(body.patient.id).toBe(patientB.patientId);
    expect(body.medicalHistory?.otherDiseases).toBe('enfermedad patient-b');
    expect(body.clinicalExam).toBeNull();
    expect(body.initialDiagnosis).toBeNull();
  });

  it('un usuario paciente sin ficha recibe 404', async () => {
    await request(app.getHttpServer())
      .get('/patients/me/clinical-record')
      .set('Authorization', `Bearer ${withoutRecord.token}`)
      .expect(404);
  });

  it('un odontólogo recibe 403', async () => {
    await request(app.getHttpServer())
      .get('/patients/me/clinical-record')
      .set('Authorization', `Bearer ${doctor.token}`)
      .expect(403);
  });

  it('sin token recibe 401', async () => {
    await request(app.getHttpServer())
      .get('/patients/me/clinical-record')
      .expect(401);
  });
});
