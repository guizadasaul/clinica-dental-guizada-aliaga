import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { AccessTokenVerifier } from '../src/auth/domain/AccessTokenVerifier';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { FakeAccessTokenVerifier } from './support/fake-access-token-verifier';

/** Configuración del propio doctor (CLI-191): GET/PATCH /doctors/me. */

const DOMAIN = '@e2e-cli191.test';

interface DoctorBody {
  id: string;
  displayName: string | null;
  firstName: string | null;
  phone: string | null;
  specialty: string | null;
  bio: string | null;
  color: string;
  isBookable: boolean;
  email: string | null;
  scheduleBlocks: { weekday: number; start: string; end: string }[];
}

describe('Configuración del doctor (e2e) — CLI-191', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let doctorA: string;
  let doctorB: string;
  const verifier = new FakeAccessTokenVerifier();

  async function cleanup(): Promise<void> {
    const users = await prisma.users.findMany({
      where: { email: { endsWith: DOMAIN } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await prisma.doctor_schedule_blocks.deleteMany({
      where: { doctor_id: { in: ids } },
    });
    await prisma.doctor_profiles.deleteMany({
      where: { user_id: { in: ids } },
    });
    await prisma.users.deleteMany({ where: { id: { in: ids } } });
  }

  async function createDoctor(key: string): Promise<string> {
    const authUserId = randomUUID();
    const user = await prisma.users.create({
      data: {
        auth_user_id: authUserId,
        email: `${key}${DOMAIN}`,
        role: 'odontologist',
        display_name: `Dr. ${key}`,
        phone: '+59170000001',
      },
    });
    await prisma.doctor_profiles.create({
      data: {
        user_id: user.id,
        first_name: key,
        last_name_paternal: 'Prueba',
        specialty: 'General',
        color: '#2563eb',
      },
    });
    await prisma.doctor_schedule_blocks.create({
      data: {
        doctor_id: user.id,
        weekday: 1,
        start_time: '08:00',
        end_time: '12:00',
      },
    });
    verifier.register(`token-${key}`, authUserId);
    return user.id;
  }

  const get = () =>
    request(app.getHttpServer())
      .get('/doctors/me')
      .set('Authorization', 'Bearer token-doctora');
  const patch = (body: object, token = 'token-doctora') =>
    request(app.getHttpServer())
      .patch('/doctors/me')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

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
    doctorB = await createDoctor('doctorb');
    const patientAuth = randomUUID();
    await prisma.users.create({
      data: {
        auth_user_id: patientAuth,
        email: `paciente${DOMAIN}`,
        role: 'patient',
      },
    });
    verifier.register('token-paciente', patientAuth);
  }, 60000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('GET devuelve el perfil del doctor de la sesión, con su horario', async () => {
    const res = await get().expect(200);
    const body = res.body as DoctorBody;

    expect(body.id).toBe(doctorA);
    expect(body.firstName).toBe('doctora');
    expect(body.scheduleBlocks).toEqual([
      { weekday: 1, start: '08:00', end: '12:00' },
    ]);
  });

  it('PATCH guarda nombre, teléfono, especialidad, bio, color y horario, y se normalizan los textos', async () => {
    const res = await patch({
      displayName: '  dra.   ana  pérez ',
      phone: '+59171234567',
      specialty: ' ortodoncia ',
      bio: ' Atiendo   adultos. ',
      color: '#16A34A',
      scheduleBlocks: [
        { weekday: 2, start: '09:00', end: '13:00' },
        { weekday: 2, start: '15:00', end: '19:00' },
      ],
    }).expect(200);
    const body = res.body as DoctorBody;

    expect(body).toMatchObject({
      displayName: 'Dra. Ana Pérez',
      phone: '+59171234567',
      specialty: 'Ortodoncia',
      bio: 'Atiendo adultos.',
      color: '#16a34a',
    });
    expect(body.scheduleBlocks).toHaveLength(2);
    const saved = await prisma.users.findUniqueOrThrow({
      where: { id: doctorA },
    });
    expect(saved.display_name).toBe('Dra. Ana Pérez');
    expect(saved.phone).toBe('+59171234567');
  });

  it('no toca el correo, si es reservable ni a otro doctor', async () => {
    await patch({ email: 'otro@x.com' }).expect(400);
    await patch({ isBookable: false }).expect(400);

    const other = await prisma.users.findUniqueOrThrow({
      where: { id: doctorB },
    });
    expect(other.display_name).toBe('Dr. doctorb');
    const profileB = await prisma.doctor_profiles.findUniqueOrThrow({
      where: { user_id: doctorB },
    });
    expect(profileB.color).toBe('#2563eb');
    const blocksB = await prisma.doctor_schedule_blocks.count({
      where: { doctor_id: doctorB },
    });
    expect(blocksB).toBe(1);
  });

  it('un horario con inicio después del fin o solapado se rechaza (400) y no cambia nada', async () => {
    const before = await prisma.doctor_schedule_blocks.count({
      where: { doctor_id: doctorA },
    });

    await patch({
      scheduleBlocks: [{ weekday: 1, start: '18:00', end: '09:00' }],
    }).expect(400);
    await patch({
      scheduleBlocks: [
        { weekday: 1, start: '08:00', end: '12:00' },
        { weekday: 1, start: '11:00', end: '15:00' },
      ],
    }).expect(400);

    expect(
      await prisma.doctor_schedule_blocks.count({
        where: { doctor_id: doctorA },
      }),
    ).toBe(before);
  });

  it('un color fuera de formato o un teléfono sin código de país se rechazan (400)', async () => {
    await patch({ color: 'azul' }).expect(400);
    await patch({ phone: '71234567' }).expect(400);
  });

  it('un paciente no puede usar la ruta (403) y sin sesión es 401', async () => {
    await request(app.getHttpServer())
      .get('/doctors/me')
      .set('Authorization', 'Bearer token-paciente')
      .expect(403);
    await patch({ color: '#16a34a' }, 'token-paciente').expect(403);
    await request(app.getHttpServer()).get('/doctors/me').expect(401);
  });
});
