import { createHash, randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { AccessTokenVerifier } from '../src/auth/domain/AccessTokenVerifier';
import { SupabaseAdminService } from '../src/auth/infrastructure/SupabaseAdminService';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { FakeAccessTokenVerifier } from './support/fake-access-token-verifier';
import { FakeSupabaseAdmin } from './support/fake-supabase-admin';

/**
 * Alta por teléfono de punta a punta (CLI-241): invitación → POST
 * /auth/register/phone → login (simulado) → POST /auth/sync con el token →
 * la ficha queda vinculada y GET /patients/me la devuelve. Sin Supabase: el
 * Admin API y la verificación del JWT son fakes.
 */

const TAG = 'E2E-CLI241';

interface PatientFixture {
  userId: string;
  patientId: string;
  inviteToken: string;
}

describe('Alta por teléfono (e2e) — CLI-241', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const admin = new FakeSupabaseAdmin();
  const verifier = new FakeAccessTokenVerifier();

  async function cleanup(): Promise<void> {
    const users = await prisma.users.findMany({
      where: { display_name: { startsWith: TAG } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await prisma.patient_invites.deleteMany({
      where: { user_id: { in: ids } },
    });
    await prisma.patients.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.users.deleteMany({ where: { id: { in: ids } } });
  }

  /** Ficha sin cuenta (como la deja el doctor) y una invitación vigente. */
  async function patientWithInvite(
    name: string,
    phone: string | null,
  ): Promise<PatientFixture> {
    const user = await prisma.users.create({
      data: { display_name: `${TAG} ${name}`, phone, role: 'patient' },
    });
    const patient = await prisma.patients.create({
      data: {
        user_id: user.id,
        first_name: name,
        last_name_paternal: 'Prueba',
      },
    });
    const inviteToken = randomBytes(32).toString('base64url');
    await prisma.patient_invites.create({
      data: {
        user_id: user.id,
        patient_id: patient.id,
        token_hash: createHash('sha256').update(inviteToken).digest('hex'),
        channel: 'whatsapp',
        expires_at: new Date(Date.now() + 5 * 60_000),
      },
    });
    return { userId: user.id, patientId: patient.id, inviteToken };
  }

  function register(phone: string, inviteToken: string) {
    return request(app.getHttpServer())
      .post('/auth/register/phone')
      .send({ phone, password: 'una-clave-segura', inviteToken });
  }

  /** Lo que hace el frontend después de registrar: login y sync con el token. */
  async function loginAndSync(phoneE164: string, inviteToken: string) {
    const [authUserId] = [...admin.phoneUsers.entries()].find(
      ([, phone]) => phone === phoneE164,
    ) ?? [undefined];
    if (!authUserId) throw new Error(`No se creó la cuenta ${phoneE164}`);
    const token = `token-${authUserId}`;
    verifier.register(token, authUserId);
    const sync = await request(app.getHttpServer())
      .post('/auth/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({ inviteToken });
    return { authUserId, token, sync };
  }

  beforeAll(async () => {
    process.env['THROTTLE_REGISTER_PHONE_PER_HOUR'] = '1000';
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AccessTokenVerifier)
      .useValue(verifier)
      .overrideProvider(SupabaseAdminService)
      .useValue(admin)
      .compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    await cleanup();
  });

  afterEach(() => admin.reset());

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('un teléfono boliviano: se crea la cuenta, el sync vincula la ficha y el paciente la ve', async () => {
    const fx = await patientWithInvite('Bolivia', '+59170000241');

    await register('+59170000241', fx.inviteToken).expect(201);
    const { authUserId, token, sync } = await loginAndSync(
      '+59170000241',
      fx.inviteToken,
    );

    expect(sync.status).toBe(200);
    const linked = await prisma.users.findUniqueOrThrow({
      where: { id: fx.userId },
    });
    expect(linked.auth_user_id).toBe(authUserId);
    const me = await request(app.getHttpServer())
      .get('/patients/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((me.body as { id: string }).id).toBe(fx.patientId);
  });

  it('un teléfono extranjero conserva su código de país (antes se creaba +591549…)', async () => {
    const fx = await patientWithInvite('Argentina', '+5491123456789');

    await register('+5491123456789', fx.inviteToken).expect(201);

    expect([...admin.phoneUsers.values()]).toEqual(['+5491123456789']);
    const { sync } = await loginAndSync('+5491123456789', fx.inviteToken);
    expect(sync.status).toBe(200);
    // Al vincular, el teléfono de la ficha se confirma como login con el mismo formato.
    expect([...admin.confirmedPhones.values()]).toEqual(['+5491123456789']);
  });

  it('un número distinto al de la ficha da 422 y no crea nada', async () => {
    const fx = await patientWithInvite('Otro', '+59170000242');

    const res = await register('+59170000999', fx.inviteToken).expect(422);

    expect((res.body as { message: string }).message).toContain('242');
    expect(admin.phoneUsers.size).toBe(0);
  });

  it('una invitación vencida o ya usada da 403', async () => {
    const fx = await patientWithInvite('Vencida', null);
    await prisma.patient_invites.updateMany({
      where: { patient_id: fx.patientId },
      data: { expires_at: new Date(Date.now() - 1000) },
    });

    await register('+59170000243', fx.inviteToken).expect(403);
    expect(admin.phoneUsers.size).toBe(0);
  });

  it('un teléfono que ya tiene cuenta da 409 (el frontend intenta entrar con esa contraseña)', async () => {
    const fx = await patientWithInvite('Repetido', null);

    await register('+59170000244', fx.inviteToken).expect(201);
    await register('+59170000244', fx.inviteToken).expect(409);
  });
});
