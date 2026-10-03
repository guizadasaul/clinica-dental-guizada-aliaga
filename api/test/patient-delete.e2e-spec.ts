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
 * Baja lógica de un paciente (CLI-184): DELETE /patients/users/:userId no borra
 * ninguna fila; deja la ficha marcada, la cuenta inactiva, y se rechaza si hay
 * citas futuras o saldo.
 */

// Datos propios: jest corre los e2e en paralelo.
const DOMAIN = '@e2e-cli184.test';

interface FixtureUser {
  id: string;
  authUserId: string;
  token: string;
}

interface PatientListItem {
  userId: string;
}

describe('Baja lógica de pacientes (e2e) — CLI-184', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let doctor: FixtureUser;
  const verifier = new FakeAccessTokenVerifier();

  async function cleanup(): Promise<void> {
    const users = await prisma.users.findMany({
      where: { email: { endsWith: DOMAIN } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    const patients = await prisma.patients.findMany({
      where: { OR: [{ user_id: { in: ids } }, { deleted_by: { in: ids } }] },
      select: { id: true, user_id: true },
    });
    const patientIds = patients.map((p) => p.id);
    await prisma.appointments.deleteMany({
      where: {
        OR: [{ patient_id: { in: patientIds } }, { doctor_id: { in: ids } }],
      },
    });
    await prisma.quotes.deleteMany({
      where: { patient_id: { in: patientIds } },
    });
    await prisma.patients.deleteMany({ where: { id: { in: patientIds } } });
    await prisma.users.deleteMany({
      where: { id: { in: [...ids, ...patients.map((p) => p.user_id)] } },
    });
  }

  async function createUser(
    key: string,
    role: 'patient' | 'odontologist' | 'admin' = 'patient',
  ): Promise<FixtureUser> {
    const authUserId = randomUUID();
    const user = await prisma.users.create({
      data: {
        auth_user_id: authUserId,
        email: `${key}${DOMAIN}`,
        role,
        display_name: key,
      },
    });
    verifier.register(`token-${key}`, authUserId);
    return { id: user.id, authUserId, token: `token-${key}` };
  }

  async function createPatient(key: string, dni: string): Promise<FixtureUser> {
    const user = await createUser(key);
    await prisma.patients.create({
      data: {
        user_id: user.id,
        first_name: key,
        last_name_paternal: 'Prueba',
        document_type: 'ci',
        dni,
      },
    });
    return user;
  }

  const del = (userId: string, token = doctor.token) =>
    request(app.getHttpServer())
      .delete(`/patients/users/${userId}`)
      .set('Authorization', `Bearer ${token}`);

  async function listedUserIds(): Promise<string[]> {
    const res = await request(app.getHttpServer())
      .get('/patients')
      .set('Authorization', `Bearer ${doctor.token}`)
      .expect(200);
    return (res.body as PatientListItem[]).map((p) => p.userId);
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
    doctor = await createUser('doctor', 'odontologist');
  }, 60000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('elimina al paciente: desaparece de la lista pero la fila sigue en la base', async () => {
    const target = await createPatient('borrar', '8880001');
    expect(await listedUserIds()).toContain(target.id);

    await del(target.id).expect(204);

    expect(await listedUserIds()).not.toContain(target.id);
    const user = await prisma.users.findUnique({ where: { id: target.id } });
    expect(user?.is_active).toBe(false);
    const patient = await prisma.patients.findUnique({
      where: { user_id: target.id },
    });
    expect(patient?.deleted_at).not.toBeNull();
    expect(patient?.deleted_by).toBe(doctor.id);
  });

  it('no se puede eliminar dos veces (404)', async () => {
    const target = await createPatient('dos-veces', '8880002');
    await del(target.id).expect(204);
    await del(target.id).expect(404);
  });

  it('con una cita futura se rechaza (409) y no cambia nada', async () => {
    const target = await createPatient('con-cita', '8880003');
    const patient = await prisma.patients.findUniqueOrThrow({
      where: { user_id: target.id },
    });
    await prisma.appointments.create({
      data: {
        patient_id: patient.id,
        doctor_id: doctor.id,
        appointment_datetime: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        status: 'confirmed',
        source: 'doctor',
      },
    });

    const res = await del(target.id).expect(409);

    expect((res.body as { message: string }).message).toContain(
      '1 cita pendiente',
    );
    const user = await prisma.users.findUnique({ where: { id: target.id } });
    expect(user?.is_active).toBe(true);
  });

  it('con saldo pendiente se rechaza (409) y dice cuánto', async () => {
    const target = await createPatient('con-saldo', '8880004');
    const patient = await prisma.patients.findUniqueOrThrow({
      where: { user_id: target.id },
    });
    await prisma.quotes.create({
      data: {
        patient_id: patient.id,
        total_amount: 300,
        total_paid: 100,
        status: 'partially_paid',
      },
    });

    const res = await del(target.id).expect(409);

    expect((res.body as { message: string }).message).toContain(
      'saldo pendiente de Bs 200.00',
    );
  });

  it('un paciente eliminado sin ficha también se da de baja', async () => {
    const target = await createUser('sin-ficha');

    await del(target.id).expect(204);

    expect(await listedUserIds()).not.toContain(target.id);
  });

  it('se puede dar de alta otro paciente con el mismo documento y correo', async () => {
    const target = await createPatient('reutiliza', '8880005');
    await del(target.id).expect(204);

    const res = await request(app.getHttpServer())
      .post('/patients')
      .set('Authorization', `Bearer ${doctor.token}`)
      .send({
        firstName: 'Nuevo',
        lastNamePaternal: 'Paciente',
        birthDate: '1990-05-10',
        birthPlace: 'Cochabamba',
        sex: 'femenino',
        occupation: 'Docente',
        address: 'Calle Falsa 123',
        zona: 'Centro',
        ciudad: 'Quillacollo',
        email: `reutiliza${DOMAIN}`,
        emergencyContactFirstName: 'Contacto',
        emergencyContactLastName: 'Emergencia',
        emergencyContactPhone: '+59177700000',
        emergencyContactRelationship: 'Hermana',
        documentType: 'ci',
        dni: '8880005',
      })
      .expect(201);

    expect((res.body as { userId: string }).userId).not.toBe(target.id);
  });

  it('un paciente eliminado ya no puede iniciar sesión (403)', async () => {
    const target = await createPatient('sin-acceso', '8880006');
    await request(app.getHttpServer())
      .get('/patients/me')
      .set('Authorization', `Bearer ${target.token}`)
      .expect(200);

    await del(target.id).expect(204);

    const res = await request(app.getHttpServer())
      .get('/patients/me')
      .set('Authorization', `Bearer ${target.token}`)
      .expect(403);
    expect((res.body as { message: string }).message).toContain('dada de baja');
    await request(app.getHttpServer())
      .post('/auth/sync')
      .set('Authorization', `Bearer ${target.token}`)
      .send({})
      .expect(403);
  });

  it('un paciente no puede eliminar a otro (403)', async () => {
    const target = await createPatient('victima', '8880007');
    const other = await createPatient('intruso', '8880008');

    await del(target.id, other.token).expect(403);
  });
});
