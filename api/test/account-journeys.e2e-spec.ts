import { createHash, randomBytes, randomUUID } from 'node:crypto';
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
 * El recorrido completo de cada tipo de cuenta (CLI-245), de la invitación
 * a la contraseña nueva: el doctor invita → el paciente se registra → entra
 * a su ficha → olvida la contraseña → la recupera por el camino que le toca
 * (correo o link de WhatsApp). Supabase, Resend y el JWT son fakes.
 */

const TAG = 'E2E-CLI245';

describe('Recorridos de cuentas (e2e) — CLI-245', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const admin = new FakeSupabaseAdmin();
  const mailer = new FakeEmailSender();
  const verifier = new FakeAccessTokenVerifier();
  let doctorToken: string;

  const server = () => app.getHttpServer();

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

  /** Lo que deja el doctor: ficha sin cuenta y una invitación vigente. */
  async function invitedPatient(name: string, phone: string | null) {
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
    return { patientId: patient.id, inviteToken };
  }

  /** Sesión de Supabase (fake) de esa cuenta: sync y GET /patients/me. */
  async function enterPortal(authUserId: string, inviteToken?: string) {
    const token = `token-${authUserId}`;
    verifier.register(token, authUserId);
    await request(server())
      .post('/auth/sync')
      .set('Authorization', `Bearer ${token}`)
      .send(inviteToken ? { inviteToken } : {})
      .expect(200);
    const me = await request(server())
      .get('/patients/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return (me.body as { id: string }).id;
  }

  function queryParam(url: string, name: string): string | null {
    return new URL(url).searchParams.get(name);
  }

  beforeAll(async () => {
    for (const key of [
      'THROTTLE_REGISTER_PHONE_PER_HOUR',
      'THROTTLE_REGISTER_EMAIL_PER_HOUR',
      'THROTTLE_PASSWORD_RECOVER_PER_HOUR',
      'THROTTLE_PASSWORD_RESET_PER_HOUR',
    ]) {
      process.env[key] = '1000';
    }
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

    const doctorAuthId = randomUUID();
    await prisma.users.create({
      data: {
        auth_user_id: doctorAuthId,
        display_name: `${TAG} Doctora`,
        role: 'odontologist',
      },
    });
    doctorToken = `token-${doctorAuthId}`;
    verifier.register(doctorToken, doctorAuthId);
  });

  afterEach(() => {
    admin.reset();
    mailer.reset();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('teléfono: invitación → alta → portal → la clínica manda el link → contraseña nueva', async () => {
    const fx = await invitedPatient('Telefono', '+59170000345');

    await request(server())
      .post('/auth/register/phone')
      .send({
        phone: '+59170000345',
        password: 'clave-original',
        inviteToken: fx.inviteToken,
      })
      .expect(201);
    const [authUserId] = [...admin.phoneUsers.keys()];
    expect(await enterPortal(authUserId, fx.inviteToken)).toBe(fx.patientId);

    // Sin correo, "Olvidé mi contraseña" no tiene a quién mandar nada.
    await request(server())
      .post('/auth/password/recover')
      .send({ email: 'telefono@e2e-cli245.test' })
      .expect(204);
    expect(mailer.accountEmails).toHaveLength(0);

    const link = await request(server())
      .post(`/patients/${fx.patientId}/password-reset-links`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(201);
    const text = decodeURIComponent(
      (link.body as { whatsappUrl: string }).whatsappUrl.split('?text=')[1],
    );
    const resetToken = /\/recuperar\/(\S+)/.exec(text)![1];
    await request(server())
      .post(`/password-reset/${resetToken}`)
      .send({ password: 'clave-nueva-1' })
      .expect(204);

    expect(admin.passwords.get(authUserId)).toBe('clave-nueva-1');
    // La misma sesión sigue viendo su ficha.
    expect(await enterPortal(authUserId)).toBe(fx.patientId);
  });

  it('correo: invitación → alta → confirmación → portal → olvido → link de recuperación', async () => {
    const fx = await invitedPatient('Correo', null);
    const email = `correo@e2e-cli245.test`;

    await request(server())
      .post('/auth/register/email')
      .send({ email, password: 'clave-original', inviteToken: fx.inviteToken })
      .expect(201);
    const [confirmation] = mailer.accountEmails;
    expect(confirmation.kind).toBe('confirm_email');
    expect(queryParam(confirmation.actionUrl, 'type')).toBe('signup');
    expect(queryParam(confirmation.actionUrl, 'token_hash')).toBeTruthy();

    // Abre el link en otro navegador: sesión nueva, sin token de invitación.
    const [authUserId] = [...admin.emailUsers.keys()];
    admin.confirmEmail(authUserId);
    expect(await enterPortal(authUserId)).toBe(fx.patientId);

    mailer.reset();
    await request(server())
      .post('/auth/password/recover')
      .send({ email })
      .expect(204);
    const [recovery] = mailer.accountEmails;
    expect(recovery.to).toBe(email);
    expect(recovery.kind).toBe('reset_password');
    expect(new URL(recovery.actionUrl).pathname).toBe('/auth/reset-password');
    expect(queryParam(recovery.actionUrl, 'type')).toBe('recovery');
    expect(queryParam(recovery.actionUrl, 'token_hash')).toBeTruthy();
  });
});
