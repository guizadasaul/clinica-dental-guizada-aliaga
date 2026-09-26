import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { AccessTokenVerifier } from '../src/auth/domain/AccessTokenVerifier';
import { ActorResolver } from '../src/chatbot/application/actor-resolver';
import { ChannelLinkingService } from '../src/chatbot/application/channel-linking.service';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { FakeAccessTokenVerifier } from './support/fake-access-token-verifier';
import { randomUUID } from 'node:crypto';

/**
 * Vinculación de WhatsApp de punta a punta contra Postgres real (CLI-100):
 * el código se pide por HTTP con sesión y se canjea con el service, como lo
 * va a hacer el adaptador de WhatsApp (CLI-101).
 */
const NUMBER = '+59170000123';
// Dominio propio: las suites e2e corren en paralelo y no comparten fixtures.
const DOMAIN = '@e2e-linking.test';

interface LinkingUser {
  id: string;
  authUserId: string;
  token: string;
  patientId: string;
}

async function cleanup(prisma: PrismaService): Promise<void> {
  const users = await prisma.users.findMany({
    where: { email: { endsWith: DOMAIN } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await prisma.patients.deleteMany({ where: { user_id: { in: ids } } });
  // Vínculos y códigos caen en cascada con el usuario.
  await prisma.users.deleteMany({ where: { id: { in: ids } } });
  await prisma.chat_link_attempts.deleteMany({
    where: { external_id: NUMBER },
  });
}

async function createPatient(
  prisma: PrismaService,
  key: string,
): Promise<LinkingUser> {
  const authUserId = randomUUID();
  const user = await prisma.users.create({
    data: {
      auth_user_id: authUserId,
      email: `${key}${DOMAIN}`,
      role: 'patient',
      // Un teléfono cargado por un tercero: nunca debe identificarlo.
      phone: '+59170000999',
    },
  });
  const patient = await prisma.patients.create({
    data: {
      user_id: user.id,
      first_name: key,
      last_name_paternal: 'E2E',
    },
  });
  return {
    id: user.id,
    authUserId,
    token: `token-${key}`,
    patientId: patient.id,
  };
}

describe('Chatbot: vinculación de WhatsApp (e2e) — CLI-100', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let linking: ChannelLinkingService;
  let actors: ActorResolver;
  let fx: { patientA: LinkingUser; patientB: LinkingUser };
  const verifier = new FakeAccessTokenVerifier();

  beforeAll(async () => {
    process.env['THROTTLE_CHAT_LINK_CODES_PER_HOUR'] = '1000';
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AccessTokenVerifier)
      .useValue(verifier)
      .compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    linking = app.get(ChannelLinkingService);
    actors = app.get(ActorResolver);
    await cleanup(prisma);
    fx = {
      patientA: await createPatient(prisma, 'link-a'),
      patientB: await createPatient(prisma, 'link-b'),
    };
    for (const user of [fx.patientA, fx.patientB]) {
      verifier.register(user.token, user.authUserId);
    }
  });

  afterAll(async () => {
    await cleanup(prisma);
    const leftovers = await prisma.chat_channel_identities.count({
      where: { external_id: NUMBER },
    });
    await app.close();
    expect(leftovers).toBe(0);
  });

  async function requestCode(token: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/chat/channel-links/whatsapp')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    const body = res.body as { code: string; command: string };
    expect(body.command).toBe(`VINCULAR ${body.code}`);
    return body.code;
  }

  function links(token: string) {
    return request(app.getHttpServer())
      .get('/chat/channel-links')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  }

  it('sin sesión no se puede pedir un código', async () => {
    await request(app.getHttpServer())
      .post('/chat/channel-links/whatsapp')
      .expect(401);
  });

  it('un número sin vincular es anónimo aunque coincida con users.phone', async () => {
    await expect(
      actors.fromChannelIdentity('whatsapp', '+59170000999'),
    ).resolves.toEqual({ kind: 'anonymous' });
  });

  it('código pedido en la web + canje desde el número → ese número es el paciente', async () => {
    const code = await requestCode(fx.patientA.token);
    const stored = await prisma.chat_link_codes.findMany({
      where: { user_id: fx.patientA.id },
    });
    expect(JSON.stringify(stored)).not.toContain(`"${code}"`);

    await expect(
      linking.redeem('whatsapp', NUMBER.slice(1), code),
    ).resolves.toMatchObject({ status: 'linked', userId: fx.patientA.id });
    await expect(
      actors.fromChannelIdentity('whatsapp', NUMBER),
    ).resolves.toEqual({
      kind: 'user',
      userId: fx.patientA.id,
      role: 'patient',
      patientId: fx.patientA.patientId,
    });
    const res = await links(fx.patientA.token);
    expect(res.body).toEqual([
      expect.objectContaining({ channel: 'whatsapp', number: '•••• 0123' }),
    ]);
  });

  it('el mismo número canjeado por otra cuenta pasa a esa cuenta y la anterior lo pierde', async () => {
    const code = await requestCode(fx.patientB.token);

    await expect(
      linking.redeem('whatsapp', NUMBER, code),
    ).resolves.toMatchObject({
      status: 'linked',
      userId: fx.patientB.id,
      previousUserId: fx.patientA.id,
    });
    expect((await links(fx.patientA.token)).body).toEqual([]);
    await expect(
      actors.fromChannelIdentity('whatsapp', NUMBER),
    ).resolves.toMatchObject({ userId: fx.patientB.id });
  });

  it('la base no admite dos vínculos activos para el mismo número', async () => {
    await expect(
      prisma.chat_channel_identities.create({
        data: {
          user_id: fx.patientA.id,
          channel: 'whatsapp',
          external_id: NUMBER,
          verified_at: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it('A no puede desvincular el número de B; B sí, y el número vuelve a ser anónimo', async () => {
    const [link] = (await links(fx.patientB.token)).body as Array<{
      id: string;
    }>;

    await request(app.getHttpServer())
      .delete(`/chat/channel-links/${link.id}`)
      .set('Authorization', `Bearer ${fx.patientA.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/chat/channel-links/${link.id}`)
      .set('Authorization', `Bearer ${fx.patientB.token}`)
      .expect(204);
    await expect(
      actors.fromChannelIdentity('whatsapp', NUMBER),
    ).resolves.toEqual({ kind: 'anonymous' });
  });
});
