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
 * Paciente que llega a la clínica sin reserva previa (CLI-171): el doctor lo da
 * de alta con POST /patients sin userId. El sistema crea el usuario (sin
 * cuenta ni email) y la ficha, y bloquea duplicados por documento o teléfono.
 */

// Datos propios: jest corre los e2e en paralelo y dos suites que limpian el
// mismo dominio de email se pisan entre sí.
const FIXTURE_DOMAIN = '@e2e-cli171.test';
const EXISTING_DNI = '7654321';
const EXISTING_PHONE = '+59170001234';

interface FixtureUser {
  id: string;
  authUserId: string;
  token: string;
}

interface CreatedPatientBody {
  id: string;
  userId: string;
  assignedDoctorId: string | null;
  phone: string | null;
}

interface PatientListItem {
  userId: string;
  hasAccount: boolean;
  email: string | null;
  patient: { id: string } | null;
}

function newPatientPayload(overrides: Record<string, unknown> = {}) {
  return {
    firstName: 'Nuevo',
    lastNamePaternal: 'Paciente',
    birthDate: '1990-05-10',
    birthPlace: 'Cochabamba',
    sex: 'femenino',
    occupation: 'Docente',
    address: 'Calle Falsa 123',
    zona: 'Centro',
    ciudad: 'Quillacollo',
    emergencyContactFirstName: 'Contacto',
    emergencyContactLastName: 'Emergencia',
    emergencyContactPhone: '+59177700000',
    emergencyContactRelationship: 'Hermana',
    documentType: 'ci',
    dni: '1112223',
    ...overrides,
  };
}

describe('Alta de un paciente nuevo por el doctor (e2e) — CLI-171', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let doctor: FixtureUser;
  let patientUser: FixtureUser;
  const verifier = new FakeAccessTokenVerifier();

  async function cleanupFixtures(): Promise<void> {
    const doctors = await prisma.users.findMany({
      where: { email: { endsWith: FIXTURE_DOMAIN }, role: 'odontologist' },
      select: { id: true },
    });
    const doctorIds = doctors.map((d) => d.id);
    // Los pacientes nuevos se crean sin email: se encuentran por su doctor.
    const created = await prisma.patients.findMany({
      where: { assigned_doctor_id: { in: doctorIds } },
      select: { user_id: true },
    });
    await prisma.patients.deleteMany({
      where: { assigned_doctor_id: { in: doctorIds } },
    });
    await prisma.patients.deleteMany({
      where: { users: { email: { endsWith: FIXTURE_DOMAIN } } },
    });
    await prisma.users.deleteMany({
      where: {
        OR: [
          { id: { in: created.map((c) => c.user_id) } },
          { email: { endsWith: FIXTURE_DOMAIN } },
        ],
      },
    });
  }

  async function createUser(
    key: string,
    role: 'patient' | 'odontologist',
    extra: { phone?: string; displayName?: string } = {},
  ): Promise<FixtureUser> {
    const authUserId = randomUUID();
    const user = await prisma.users.create({
      data: {
        auth_user_id: authUserId,
        email: `${key}${FIXTURE_DOMAIN}`,
        role,
        display_name: extra.displayName ?? key,
        phone: extra.phone ?? null,
      },
    });
    verifier.register(`token-${key}`, authUserId);
    return { id: user.id, authUserId, token: `token-${key}` };
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
    patientUser = await createUser('patient', 'patient');

    // Un paciente que ya existe, con documento, y otra persona con un teléfono.
    const existing = await createUser('existing', 'patient', {
      displayName: 'Beto Bravo',
    });
    await prisma.patients.create({
      data: {
        user_id: existing.id,
        first_name: 'Beto',
        last_name_paternal: 'Bravo',
        document_type: 'ci',
        dni: EXISTING_DNI,
      },
    });
    await createUser('phone-owner', 'patient', {
      phone: EXISTING_PHONE,
      displayName: 'Carla Cruz',
    });
  }, 60000);

  afterAll(async () => {
    await cleanupFixtures();
    await app.close();
  });

  it('el doctor da de alta a un paciente nuevo: queda con ficha, sin cuenta y asignado a él', async () => {
    const res = await request(app.getHttpServer())
      .post('/patients')
      .set('Authorization', `Bearer ${doctor.token}`)
      .send(newPatientPayload({ phone: '+59171112223' }))
      .expect(201);

    const created = res.body as CreatedPatientBody;
    expect(created.assignedDoctorId).toBe(doctor.id);
    expect(created.phone).toBe('+59171112223');
    // Es una persona nueva: no es el usuario del propio doctor.
    expect(created.userId).not.toBe(doctor.id);

    const list = await request(app.getHttpServer())
      .get('/patients')
      .set('Authorization', `Bearer ${doctor.token}`)
      .expect(200);
    const item = (list.body as PatientListItem[]).find(
      (p) => p.patient?.id === created.id,
    );
    expect(item).toBeDefined();
    // Sin cuenta ni email: se la puede invitar después.
    expect(item!.hasAccount).toBe(false);
    expect(item!.email).toBeNull();
  });

  it('un documento que ya tiene ficha se bloquea y dice quién es', async () => {
    const res = await request(app.getHttpServer())
      .post('/patients')
      .set('Authorization', `Bearer ${doctor.token}`)
      .send(newPatientPayload({ dni: EXISTING_DNI }))
      .expect(409);

    expect((res.body as { message: string }).message).toContain(
      'Ya existe Beto Bravo con ese documento',
    );
  });

  it('un teléfono que ya es de otra persona se bloquea y dice quién es', async () => {
    const res = await request(app.getHttpServer())
      .post('/patients')
      .set('Authorization', `Bearer ${doctor.token}`)
      .send(newPatientPayload({ dni: '9998887', phone: EXISTING_PHONE }))
      .expect(409);

    expect((res.body as { message: string }).message).toContain(
      'Ya existe Carla Cruz con ese teléfono',
    );
  });

  it('un paciente no puede dar de alta a otro (403)', async () => {
    await request(app.getHttpServer())
      .post('/patients')
      .set('Authorization', `Bearer ${patientUser.token}`)
      .send(newPatientPayload({ dni: '5554443' }))
      .expect(403);
  });
});
