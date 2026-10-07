import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { AccessTokenVerifier } from '../src/auth/domain/AccessTokenVerifier';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { FakeAccessTokenVerifier } from './support/fake-access-token-verifier';

/** Horarios que el doctor aparta de su agenda (CLI-195). */

const DOMAIN = '@e2e-cli195.test';
// Un lunes lejano: no cae en las ventanas de los reportes de otros e2e.
const MONDAY = '2030-01-14';

interface BlockBody {
  id: string;
  doctorId: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

describe('Horarios reservados por el doctor (e2e) — CLI-195', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let doctorA: string;
  let patientId: string;
  const verifier = new FakeAccessTokenVerifier();

  async function cleanup(): Promise<void> {
    const users = await prisma.users.findMany({
      where: { email: { endsWith: DOMAIN } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await prisma.appointments.deleteMany({ where: { doctor_id: { in: ids } } });
    await prisma.doctor_time_blocks.deleteMany({
      where: { doctor_id: { in: ids } },
    });
    await prisma.doctor_schedule_blocks.deleteMany({
      where: { doctor_id: { in: ids } },
    });
    await prisma.doctor_profiles.deleteMany({
      where: { user_id: { in: ids } },
    });
    await prisma.patients.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.users.deleteMany({ where: { id: { in: ids } } });
  }

  async function createDoctor(key: string): Promise<string> {
    const authUserId = randomUUID();
    const user = await prisma.users.create({
      data: {
        auth_user_id: authUserId,
        email: `${key}${DOMAIN}`,
        role: 'odontologist',
        display_name: key,
      },
    });
    await prisma.doctor_profiles.create({
      data: {
        user_id: user.id,
        first_name: key,
        last_name_paternal: 'E2E',
        is_bookable: true,
      },
    });
    await prisma.doctor_schedule_blocks.create({
      data: {
        doctor_id: user.id,
        weekday: 1,
        start_time: '08:00',
        end_time: '18:00',
      },
    });
    verifier.register(`token-${key}`, authUserId);
    return user.id;
  }

  const at = (hhmm: string) => `${MONDAY}T${hhmm}:00-04:00`;
  const post = (body: object, token = 'token-doctora') =>
    request(app.getHttpServer())
      .post('/appointments/blocks')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const list = (token = 'token-doctora') =>
    request(app.getHttpServer())
      .get('/appointments/blocks')
      .query({ from: MONDAY, to: '2030-01-21' })
      .set('Authorization', `Bearer ${token}`);
  const del = (id: string, token = 'token-doctora') =>
    request(app.getHttpServer())
      .delete(`/appointments/blocks/${id}`)
      .set('Authorization', `Bearer ${token}`);
  const free = async (doctorId: string) =>
    (
      (
        await request(app.getHttpServer())
          .get('/public/availability')
          .query({ doctorId, date: MONDAY })
          .expect(200)
      ).body as { slots: string[] }
    ).slots.map((s) => new Date(s).toISOString());

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
    doctorA = await createDoctor('doctora');
    await createDoctor('doctorb');
    const patientAuthId = randomUUID();
    const patientUser = await prisma.users.create({
      data: {
        auth_user_id: patientAuthId,
        email: `paciente${DOMAIN}`,
        role: 'patient',
        display_name: 'Paciente E2E',
      },
    });
    patientId = (
      await prisma.patients.create({
        data: {
          user_id: patientUser.id,
          first_name: 'Paciente',
          last_name_paternal: 'E2E',
        },
      })
    ).id;
    verifier.register('token-paciente', patientAuthId);
  }, 60000);

  afterEach(async () => {
    await prisma.doctor_time_blocks.deleteMany({
      where: { users: { email: { endsWith: DOMAIN } } },
    });
    await prisma.appointments.deleteMany({
      where: { users: { email: { endsWith: DOMAIN } } },
    });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('reserva un horario, se lista, y la disponibilidad pública no lo ofrece; al quitarlo vuelve', async () => {
    const created = await post({
      startsAt: at('14:00'),
      endsAt: at('16:00'),
      reason: '  curso de   ortodoncia ',
    }).expect(201);
    const block = created.body as BlockBody;
    expect(block.doctorId).toBe(doctorA);
    expect(block.reason).toBe('curso de ortodoncia');

    const listed = (await list().expect(200)).body as BlockBody[];
    expect(listed.map((b) => b.id)).toEqual([block.id]);

    const blocked = await free(doctorA);
    for (const hhmm of ['14:00', '14:30', '15:00', '15:30']) {
      expect(blocked).not.toContain(new Date(at(hhmm)).toISOString());
    }
    expect(blocked).toContain(new Date(at('13:30')).toISOString());
    expect(blocked).toContain(new Date(at('16:00')).toISOString());

    await del(block.id).expect(204);

    expect(await free(doctorA)).toContain(new Date(at('14:00')).toISOString());
    expect((await list().expect(200)).body as BlockBody[]).toHaveLength(0);
  });

  it('el doctor no puede agendar a un paciente encima de su horario reservado (409)', async () => {
    await post({ startsAt: at('10:00'), endsAt: at('12:00') }).expect(201);

    const res = await request(app.getHttpServer())
      .post('/appointments/doctor')
      .set('Authorization', 'Bearer token-doctora')
      .send({
        patientId,
        appointmentDatetime: at('11:00'),
        durationMinutes: 30,
      })
      .expect(409);

    expect((res.body as { message: string }).message).toContain(
      'reservado en tu agenda',
    );
  });

  it('no se reserva encima de citas que ya tiene: 409 que dice cuántas, y no queda nada', async () => {
    await request(app.getHttpServer())
      .post('/appointments/doctor')
      .set('Authorization', 'Bearer token-doctora')
      .send({
        patientId,
        appointmentDatetime: at('15:00'),
        durationMinutes: 60,
      })
      .expect(201);

    const res = await post({
      startsAt: at('14:00'),
      endsAt: at('16:00'),
    }).expect(409);

    expect((res.body as { message: string }).message).toContain(
      'ya tienes 1 cita',
    );
    expect((await list().expect(200)).body as BlockBody[]).toHaveLength(0);
  });

  it('rechaza (400) horas que no son múltiplo de 5, fin antes del inicio, o el doctor en el body', async () => {
    await post({ startsAt: at('14:03'), endsAt: at('15:00') }).expect(400);
    await post({ startsAt: at('16:00'), endsAt: at('15:00') }).expect(400);
    await post({
      startsAt: at('14:00'),
      endsAt: at('15:00'),
      doctorId: randomUUID(),
    }).expect(400);
  });

  it('cada doctor ve y quita solo los suyos (404 al quitar uno ajeno)', async () => {
    const block = (
      await post({ startsAt: at('09:00'), endsAt: at('10:00') }).expect(201)
    ).body as BlockBody;

    expect(
      (await list('token-doctorb').expect(200)).body as BlockBody[],
    ).toHaveLength(0);
    await del(block.id, 'token-doctorb').expect(404);
    expect((await list().expect(200)).body as BlockBody[]).toHaveLength(1);
  });

  it('un paciente no puede usar las rutas (403) y sin sesión es 401', async () => {
    await post(
      { startsAt: at('14:00'), endsAt: at('15:00') },
      'token-paciente',
    ).expect(403);
    await request(app.getHttpServer())
      .get('/appointments/blocks')
      .query({ from: MONDAY, to: MONDAY })
      .expect(401);
  });
});
