import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
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
 * Contraseña nueva por WhatsApp para cuentas de teléfono (CLI-244): el doctor
 * arma el link desde la ficha → el paciente lo abre → elige la contraseña →
 * Supabase (fake) la recibe para esa cuenta y para ninguna otra.
 */

const TAG = 'E2E-CLI244';

describe('Contraseña nueva por WhatsApp (e2e) — CLI-244', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const admin = new FakeSupabaseAdmin();
  const verifier = new FakeAccessTokenVerifier();
  let doctorToken: string;

  async function cleanup(): Promise<void> {
    const users = await prisma.users.findMany({
      where: { display_name: { startsWith: TAG } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await prisma.patients.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.users.deleteMany({ where: { id: { in: ids } } });
  }

  /** Paciente con cuenta creada por teléfono (o sin cuenta, si authUserId es null). */
  async function patient(
    name: string,
    phone: string | null,
    authUserId: string | null = randomUUID(),
  ) {
    const user = await prisma.users.create({
      data: {
        display_name: `${TAG} ${name}`,
        role: 'patient',
        phone,
        auth_user_id: authUserId,
      },
    });
    const ficha = await prisma.patients.create({
      data: {
        user_id: user.id,
        first_name: name,
        last_name_paternal: 'Prueba',
      },
    });
    return { patientId: ficha.id, authUserId };
  }

  function createLink(patientId: string, token = doctorToken) {
    return request(app.getHttpServer())
      .post(`/patients/${patientId}/password-reset-links`)
      .set('Authorization', `Bearer ${token}`);
  }

  /** El token crudo, sacado del link de WhatsApp como lo abriría el paciente. */
  function tokenFrom(whatsappUrl: string): string {
    const text = decodeURIComponent(whatsappUrl.split('?text=')[1]);
    const token = /\/recuperar\/(\S+)/.exec(text)?.[1];
    if (!token) throw new Error(`Sin link en: ${text}`);
    return token;
  }

  function status(token: string) {
    return request(app.getHttpServer()).get(`/password-reset/${token}/status`);
  }

  function reset(token: string, password = 'una-clave-nueva') {
    return request(app.getHttpServer())
      .post(`/password-reset/${token}`)
      .send({ password });
  }

  beforeAll(async () => {
    process.env['THROTTLE_PASSWORD_RESET_PER_HOUR'] = '1000';
    process.env['FRONTEND_URL'] = 'https://app.example.com';
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

  afterEach(() => admin.reset());

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('el doctor arma el link, el paciente elige la contraseña y solo cambia la de su cuenta', async () => {
    const ana = await patient('Ana', '+59170000244');
    const otro = await patient('Otro', '+59170000245');

    const res = await createLink(ana.patientId).expect(201);
    const { whatsappUrl } = res.body as { whatsappUrl: string };
    expect(whatsappUrl).toMatch(/^https:\/\/wa\.me\/59170000244\?text=/);
    const token = tokenFrom(whatsappUrl);

    await status(token).expect(200).expect({ valid: true, phoneHint: '244' });
    await reset(token).expect(204);

    expect([...admin.passwords.entries()]).toEqual([
      [ana.authUserId, 'una-clave-nueva'],
    ]);
    expect(admin.passwords.has(otro.authUserId!)).toBe(false);
  });

  it('el link sirve una sola vez', async () => {
    const fx = await patient('Una', '+59170000246');
    const token = tokenFrom(
      ((await createLink(fx.patientId)).body as { whatsappUrl: string })
        .whatsappUrl,
    );

    await reset(token).expect(204);
    await reset(token, 'otra-clave-mas').expect(403);
    await status(token).expect(200).expect({ valid: false });
    expect(admin.passwords.get(fx.authUserId!)).toBe('una-clave-nueva');
  });

  it('un link nuevo invalida el anterior', async () => {
    const fx = await patient('Dos', '+59170000247');
    const first = tokenFrom(
      ((await createLink(fx.patientId)).body as { whatsappUrl: string })
        .whatsappUrl,
    );
    const second = tokenFrom(
      ((await createLink(fx.patientId)).body as { whatsappUrl: string })
        .whatsappUrl,
    );

    await reset(first).expect(403);
    await reset(second).expect(204);
  });

  it('el link vence a las 24 horas (CLI-255)', async () => {
    const fx = await patient('Vence', '+59170000248');
    const token = tokenFrom(
      ((await createLink(fx.patientId)).body as { whatsappUrl: string })
        .whatsappUrl,
    );
    const link = await prisma.password_reset_links.findFirstOrThrow({
      where: { users: { display_name: `${TAG} Vence` } },
    });
    const ttl = link.expires_at.getTime() - link.created_at.getTime();
    expect(ttl).toBeGreaterThan(24 * 60 * 60_000 - 60_000);
    expect(ttl).toBeLessThanOrEqual(24 * 60 * 60_000 + 5000);

    await prisma.password_reset_links.update({
      where: { id: link.id },
      data: { expires_at: new Date(Date.now() - 1000) },
    });

    await status(token).expect(200).expect({ valid: false });
    await reset(token).expect(403);
    expect(admin.passwords.size).toBe(0);
  });

  it('si Supabase rechaza la contraseña, el mismo link sirve para reintentar', async () => {
    const fx = await patient('Debil', '+59170000249');
    const token = tokenFrom(
      ((await createLink(fx.patientId)).body as { whatsappUrl: string })
        .whatsappUrl,
    );
    admin.failNextSetPassword = new BadRequestException(
      'Esa contraseña es muy fácil de adivinar. Elige otra.',
    );

    const rejected = await reset(token, '12345678').expect(400);
    expect((rejected.body as { message: string }).message).toContain(
      'fácil de adivinar',
    );
    await reset(token).expect(204);
  });

  it('solo un odontólogo puede armar el link', async () => {
    const fx = await patient('Paciente', '+59170000250');
    const patientToken = `token-${fx.authUserId}`;
    verifier.register(patientToken, fx.authUserId!);

    await createLink(fx.patientId, patientToken).expect(403);
    await request(app.getHttpServer())
      .post(`/patients/${fx.patientId}/password-reset-links`)
      .expect(401);
  });

  it('un paciente sin cuenta o sin teléfono da 409', async () => {
    const sinCuenta = await patient('SinCuenta', '+59170000251', null);
    const sinTelefono = await patient('SinTelefono', null);

    await createLink(sinCuenta.patientId).expect(409);
    await createLink(sinTelefono.patientId).expect(409);
  });

  it('una contraseña de menos de 8 caracteres da 400 sin gastar el link', async () => {
    const fx = await patient('Corta', '+59170000252');
    const token = tokenFrom(
      ((await createLink(fx.patientId)).body as { whatsappUrl: string })
        .whatsappUrl,
    );

    await reset(token, 'corta').expect(400);
    await status(token).expect(200).expect({ valid: true, phoneHint: '252' });
  });

  it('un token inventado: status sin datos y 403 al usarlo', async () => {
    await status('no-existe').expect(200).expect({ valid: false });
    await reset('no-existe').expect(403);
  });
});
