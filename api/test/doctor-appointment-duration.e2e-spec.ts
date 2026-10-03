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
 * Duración libre y hora de inicio cada 5 minutos en las citas que agenda el
 * doctor (CLI-194), y su efecto en la disponibilidad pública.
 */

const DOMAIN = '@e2e-cli194.test';
// Un lunes lejano: no cae en las ventanas de los reportes de otros e2e, que
// suman las citas de todos los doctores.
const MONDAY = '2030-01-07';

interface AvailabilityBody {
  slots: string[];
}

describe('Citas del doctor con duración libre (e2e) — CLI-194', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let doctorId: string;
  let patientId: string;
  const verifier = new FakeAccessTokenVerifier();

  async function cleanup(): Promise<void> {
    const users = await prisma.users.findMany({
      where: { email: { endsWith: DOMAIN } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await prisma.appointments.deleteMany({ where: { doctor_id: { in: ids } } });
    await prisma.doctor_schedule_blocks.deleteMany({
      where: { doctor_id: { in: ids } },
    });
    await prisma.doctor_profiles.deleteMany({
      where: { user_id: { in: ids } },
    });
    await prisma.patients.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.users.deleteMany({ where: { id: { in: ids } } });
  }

  const at = (hhmm: string) => `${MONDAY}T${hhmm}:00-04:00`;
  const book = (body: object) =>
    request(app.getHttpServer())
      .post('/appointments/doctor')
      .set('Authorization', 'Bearer token-doctor')
      .send({ patientId, ...body });
  const freeSlots = async () =>
    (
      (
        await request(app.getHttpServer())
          .get('/public/availability')
          .query({ doctorId, date: MONDAY })
          .expect(200)
      ).body as AvailabilityBody
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

    const authUserId = randomUUID();
    const doctor = await prisma.users.create({
      data: {
        auth_user_id: authUserId,
        email: `doctor${DOMAIN}`,
        role: 'odontologist',
        display_name: 'Dr. E2E',
      },
    });
    doctorId = doctor.id;
    verifier.register('token-doctor', authUserId);
    await prisma.doctor_profiles.create({
      data: {
        user_id: doctorId,
        first_name: 'Doc',
        last_name_paternal: 'E2E',
        is_bookable: true,
      },
    });
    await prisma.doctor_schedule_blocks.create({
      data: {
        doctor_id: doctorId,
        weekday: 1,
        start_time: '08:00',
        end_time: '12:00',
      },
    });
    const patientUser = await prisma.users.create({
      data: {
        email: `paciente${DOMAIN}`,
        role: 'patient',
        display_name: 'Paciente E2E',
      },
    });
    const patient = await prisma.patients.create({
      data: {
        user_id: patientUser.id,
        first_name: 'Paciente',
        last_name_paternal: 'E2E',
      },
    });
    patientId = patient.id;
  }, 60000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('agenda una cita de 1 h 15 min que empieza a las 09:45 y la disponibilidad bloquea lo que toca', async () => {
    const res = await book({
      appointmentDatetime: at('09:45'),
      durationMinutes: 75,
    }).expect(201);
    expect((res.body as { durationMinutes: number }).durationMinutes).toBe(75);

    try {
      const free = await freeSlots();
      // 09:45–11:00 toca los slots de 09:30, 10:00 y 10:30; 09:00 y 11:00 siguen libres.
      for (const hhmm of ['09:30', '10:00', '10:30']) {
        expect(free).not.toContain(new Date(at(hhmm)).toISOString());
      }
      expect(free).toContain(new Date(at('09:00')).toISOString());
      expect(free).toContain(new Date(at('11:00')).toISOString());
    } finally {
      await prisma.appointments.deleteMany({ where: { doctor_id: doctorId } });
    }
  });

  it('rechaza una hora de inicio que no es múltiplo de 5 minutos (400)', async () => {
    await book({
      appointmentDatetime: at('09:12'),
      durationMinutes: 30,
    }).expect(400);
  });

  it.each([0, 3, 47, 485])(
    'rechaza una duración de %i minutos (400)',
    async (durationMinutes) => {
      await book({ appointmentDatetime: at('09:00'), durationMinutes }).expect(
        400,
      );
    },
  );

  it('no deja pisar otra cita aunque empiece fuera de la grilla de 30', async () => {
    await book({
      appointmentDatetime: at('09:45'),
      durationMinutes: 30,
    }).expect(201);
    try {
      await book({
        appointmentDatetime: at('10:00'),
        durationMinutes: 30,
      }).expect(409);
      await book({
        appointmentDatetime: at('10:15'),
        durationMinutes: 30,
      }).expect(201);
    } finally {
      await prisma.appointments.deleteMany({ where: { doctor_id: doctorId } });
    }
  });
});
