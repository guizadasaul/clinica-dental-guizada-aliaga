import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { AccessTokenVerifier } from '../src/auth/domain/AccessTokenVerifier';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { TestimonialsService } from '../src/testimonials/application/testimonials.service';
import { FakeAccessTokenVerifier } from './support/fake-access-token-verifier';

/**
 * Moderación de comentarios (CLI-188): es del administrador. Solo hay una fila
 * de admin permitida en la base (idx_one_admin_user) y chatbot-security ya
 * crea la suya, así que acá no se crea otra: el 403 de doctor y paciente se
 * prueba por HTTP y el flujo pendiente → aprobado/rechazado → público se
 * prueba con el servicio contra la base real.
 */

const DOMAIN = '@e2e-cli188.test';
const MARK = 'E2E CLI-188';

describe('Moderación de comentarios (e2e) — CLI-188', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let testimonials: TestimonialsService;
  const verifier = new FakeAccessTokenVerifier();

  async function cleanup(): Promise<void> {
    await prisma.testimonials.deleteMany({
      where: { name: { startsWith: MARK } },
    });
    await prisma.users.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  }

  async function createUser(key: string, role: 'patient' | 'odontologist') {
    const authUserId = randomUUID();
    await prisma.users.create({
      data: {
        auth_user_id: authUserId,
        email: `${key}${DOMAIN}`,
        role,
        display_name: key,
      },
    });
    verifier.register(`token-${key}`, authUserId);
    return `token-${key}`;
  }

  async function createPending(suffix: string) {
    return prisma.testimonials.create({
      data: {
        name: `${MARK} ${suffix}`,
        treatment: 'Limpieza',
        comment: 'Muy buena atención',
      },
    });
  }

  let doctorToken: string;
  let patientToken: string;

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
    testimonials = moduleFixture.get(TestimonialsService);
    await cleanup();
    doctorToken = await createUser('doctor', 'odontologist');
    patientToken = await createUser('patient', 'patient');
  }, 60000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('un doctor ya no puede ver ni moderar los comentarios (403)', async () => {
    const pending = await createPending('doctor');

    await request(app.getHttpServer())
      .get('/admin/testimonials/pending')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/admin/testimonials/${pending.id}/status`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ status: 'approved' })
      .expect(403);

    const still = await prisma.testimonials.findUniqueOrThrow({
      where: { id: pending.id },
    });
    expect(still.status).toBe('pending');
  });

  it('un paciente tampoco puede moderar (403) y sin sesión es 401', async () => {
    const pending = await createPending('paciente');

    await request(app.getHttpServer())
      .patch(`/admin/testimonials/${pending.id}/status`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ status: 'approved' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/admin/testimonials/pending')
      .expect(401);
  });

  it('la ruta vieja del doctor ya no existe', async () => {
    await request(app.getHttpServer())
      .get('/testimonials/pending')
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(404);
  });

  it('un comentario pendiente no es público; al aprobarlo aparece, y uno rechazado nunca', async () => {
    const toApprove = await createPending('aprobar');
    const toReject = await createPending('rechazar');
    const publicNames = async () =>
      (
        (
          await request(app.getHttpServer())
            .get('/public/testimonials')
            .expect(200)
        ).body as { name: string }[]
      ).map((t) => t.name);

    expect(await publicNames()).not.toContain(toApprove.name);
    expect((await testimonials.findPending()).map((t) => t.id)).toEqual(
      expect.arrayContaining([toApprove.id, toReject.id]),
    );

    await testimonials.updateStatus(toApprove.id, 'approved');
    await testimonials.updateStatus(toReject.id, 'rejected');

    const names = await publicNames();
    expect(names).toContain(toApprove.name);
    expect(names).not.toContain(toReject.name);
    const pendingIds = (await testimonials.findPending()).map((t) => t.id);
    expect(pendingIds).not.toContain(toApprove.id);
    expect(pendingIds).not.toContain(toReject.id);
  });
});
