import { createHash, randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { AccessTokenVerifier } from '../src/auth/domain/AccessTokenVerifier';
import { SupabaseAdminService } from '../src/auth/infrastructure/SupabaseAdminService';
import { EmailSender } from '../src/patient-invites/domain/EmailSender';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { FakeAccessTokenVerifier } from './support/fake-access-token-verifier';
import { FakeEmailSender } from './support/fake-email-sender';
import { FakeSupabaseAdmin } from './support/fake-supabase-admin';

/**
 * Alta por correo de punta a punta (CLI-242): invitación → POST
 * /auth/register/email (la ficha se vincula en el acto y sale el correo de
 * confirmación) → el paciente abre el link → POST /auth/sync sin token →
 * GET /patients/me. Sin Supabase ni Resend: los dos son fakes.
 */

const TAG = 'E2E-CLI242';
const MAIL_DOMAIN = '@e2e-cli242.test';

describe('Alta por correo (e2e) — CLI-242', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const admin = new FakeSupabaseAdmin();
  const mailer = new FakeEmailSender();
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

  async function patientWithInvite(name: string, expiresInMs = 5 * 60_000) {
    const user = await prisma.users.create({
      data: { display_name: `${TAG} ${name}`, role: 'patient' },
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
        channel: 'email',
        expires_at: new Date(Date.now() + expiresInMs),
      },
    });
    return { userId: user.id, patientId: patient.id, inviteToken };
  }

  function register(email: string, inviteToken: string) {
    return request(app.getHttpServer())
      .post('/auth/register/email')
      .send({ email, password: 'una-clave-segura', inviteToken });
  }

  beforeAll(async () => {
    process.env['THROTTLE_REGISTER_EMAIL_PER_HOUR'] = '1000';
    process.env['THROTTLE_PASSWORD_RECOVER_PER_HOUR'] = '1000';
    process.env['FRONTEND_URL'] = 'https://app.example.com';
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AccessTokenVerifier)
      .useValue(verifier)
      .overrideProvider(SupabaseAdminService)
      .useValue(admin)
      .overrideProvider(EmailSender)
      .useValue(mailer)
      .compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    await cleanup();
  });

  afterEach(() => {
    admin.reset();
    mailer.reset();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('vincula la ficha al registrarse, manda el link de confirmación y después del link el paciente entra a su ficha', async () => {
    const fx = await patientWithInvite('Carla');
    const email = `carla${MAIL_DOMAIN}`;

    await register(` Carla${MAIL_DOMAIN} `, fx.inviteToken).expect(201);

    const [[authUserId]] = [...admin.emailUsers.entries()];
    const linked = await prisma.users.findUniqueOrThrow({
      where: { id: fx.userId },
    });
    expect(linked.auth_user_id).toBe(authUserId);
    expect(linked.email).toBe(email);
    expect(mailer.accountEmails).toEqual([
      {
        to: email,
        displayName: `${TAG} Carla`,
        actionUrl:
          'https://app.example.com/auth/confirmar?token_hash=hash-1&type=signup',
        kind: 'confirm_email',
      },
    ]);

    // El paciente abre el link (en cualquier navegador): sesión nueva, sin token de invitación.
    admin.confirmEmail(authUserId);
    const token = `token-${authUserId}`;
    verifier.register(token, authUserId);
    await request(app.getHttpServer())
      .post('/auth/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);
    const me = await request(app.getHttpServer())
      .get('/patients/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((me.body as { id: string }).id).toBe(fx.patientId);
  });

  it('la invitación de 5 minutos ya no puede vencer antes de confirmar: se canjeó al registrarse', async () => {
    const fx = await patientWithInvite('Lenta', 5 * 60_000);

    await register(`lenta${MAIL_DOMAIN}`, fx.inviteToken).expect(201);

    const invite = await prisma.patient_invites.findFirstOrThrow({
      where: { patient_id: fx.patientId },
    });
    expect(invite.used_at).not.toBeNull();
  });

  it('un segundo intento antes de confirmar reenvía el correo sin volver a canjear', async () => {
    const fx = await patientWithInvite('Doble');

    await register(`doble${MAIL_DOMAIN}`, fx.inviteToken).expect(201);
    await register(`doble${MAIL_DOMAIN}`, fx.inviteToken).expect(403);

    // Con la invitación ya usada, el camino es "Reenviar el correo".
    await request(app.getHttpServer())
      .post('/auth/register/email/resend')
      .send({ email: `doble${MAIL_DOMAIN}` })
      .expect(204);
    const links = mailer.accountEmails.map((m) => m.actionUrl);
    expect(links).toHaveLength(2);
    expect(new Set(links).size).toBe(2);
  });

  it('un correo que ya tiene una cuenta confirmada da 409 y no consume la invitación', async () => {
    const first = await patientWithInvite('Primera');
    await register(`usado${MAIL_DOMAIN}`, first.inviteToken).expect(201);
    const [[authUserId]] = [...admin.emailUsers.entries()];
    admin.confirmEmail(authUserId);
    const second = await patientWithInvite('Segunda');

    const res = await register(
      `usado${MAIL_DOMAIN}`,
      second.inviteToken,
    ).expect(409);

    expect((res.body as { message: string }).message).toContain(
      'Inicia sesión o recupera tu contraseña',
    );
    const invite = await prisma.patient_invites.findFirstOrThrow({
      where: { patient_id: second.patientId },
    });
    expect(invite.used_at).toBeNull();
  });

  it('con una invitación vencida da 403 y no crea ninguna cuenta', async () => {
    const fx = await patientWithInvite('Vencida', -1000);

    await register(`vencida${MAIL_DOMAIN}`, fx.inviteToken).expect(403);

    expect(admin.emailUsers.size).toBe(0);
    expect(mailer.accountEmails).toHaveLength(0);
  });

  it('el reenvío responde 204 aunque el correo no exista, sin mandar nada ni crear cuentas', async () => {
    await request(app.getHttpServer())
      .post('/auth/register/email/resend')
      .send({ email: `nadie${MAIL_DOMAIN}` })
      .expect(204);

    expect(mailer.accountEmails).toHaveLength(0);
    expect(admin.emailUsers.size).toBe(0);
  });

  it('una contraseña de menos de 8 caracteres da 400', async () => {
    const fx = await patientWithInvite('Corta');

    await request(app.getHttpServer())
      .post('/auth/register/email')
      .send({
        email: `corta${MAIL_DOMAIN}`,
        password: 'corta',
        inviteToken: fx.inviteToken,
      })
      .expect(400);
  });

  describe('recuperación de contraseña (CLI-243)', () => {
    it('con una cuenta de correo manda el link de recuperación; sin cuenta responde igual y no manda nada', async () => {
      const fx = await patientWithInvite('Olvido');
      await register(`olvido${MAIL_DOMAIN}`, fx.inviteToken).expect(201);
      mailer.reset();

      await request(app.getHttpServer())
        .post('/auth/password/recover')
        .send({ email: ` Olvido${MAIL_DOMAIN} ` })
        .expect(204);
      await request(app.getHttpServer())
        .post('/auth/password/recover')
        .send({ email: `nadie${MAIL_DOMAIN}` })
        .expect(204);

      expect(mailer.accountEmails).toEqual([
        expect.objectContaining({
          to: `olvido${MAIL_DOMAIN}`,
          kind: 'reset_password',
          actionUrl: expect.stringMatching(
            /^https:\/\/app\.example\.com\/auth\/reset-password\?token_hash=.+&type=recovery$/,
          ) as unknown,
        }),
      ]);
    });

    it('un correo con formato inválido da 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/password/recover')
        .send({ email: 'no-es-correo' })
        .expect(400);
    });
  });
});
