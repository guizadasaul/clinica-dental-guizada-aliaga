import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { PrismaService } from '../src/shared/prisma/prisma.service';
import { INJECTION_PAYLOADS } from '../src/shared/validators/__fixtures__/injection-payloads';

// Valid-format UUID: no existe ninguna cita con este id, pero eso no importa
// para estos casos — la validación del body (ValidationPipe, antes de que
// el controller llame al service) es lo que se está probando, no si la cita
// existe. ParseUUIDPipe solo exige forma de UUID.
const PLACEHOLDER_APPOINTMENT_ID = '00000000-0000-4000-8000-000000000000';

describe('Public forms security (e2e) — CLI-36', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    // Límites bien por encima de lo que este spec puede llegar a pegarle a
    // cada endpoint (boot único, thread único) — el propósito acá es
    // probar validación de input, no el rate limiting en sí (eso queda para
    // la recorrida manual del plan). Como @Throttle() usa Resolvable<number>
    // (una función evaluada por request, ver los controllers), esto corre a
    // tiempo: se lee recién cuando llega cada request de este spec, mucho
    // después del bootstrap.
    process.env['THROTTLE_TESTIMONIALS_PER_HOUR'] = '1000';
    process.env['THROTTLE_APPOINTMENTS_HOLD_PER_HOUR'] = '1000';
    process.env['THROTTLE_APPOINTMENTS_CONTACT_PER_HOUR'] = '1000';
    process.env['THROTTLE_REGISTER_PHONE_PER_HOUR'] = '1000';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Misma configuración que producción (helmet, CORS, límite de body,
    // ValidationPipe endurecido) — ver api/src/app.config.ts.
    configureApp(app);
    await app.init();

    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe.each(INJECTION_PAYLOADS)('payload de inyección: %s', (payload) => {
    it('POST /public/testimonials responde 400', () => {
      return request(app.getHttpServer())
        .post('/public/testimonials')
        .send({ name: payload, treatment: payload, comment: payload })
        .expect(400);
    });

    it('POST /public/appointments/hold responde 400', () => {
      return request(app.getHttpServer())
        .post('/public/appointments/hold')
        .send({ slot: payload })
        .expect(400);
    });

    it('PATCH /public/appointments/:id/contact responde 400', () => {
      return request(app.getHttpServer())
        .patch(`/public/appointments/${PLACEHOLDER_APPOINTMENT_ID}/contact`)
        .send({ fullName: payload, phone: payload, email: payload })
        .expect(400);
    });

    it('POST /auth/register/phone responde 400', () => {
      return request(app.getHttpServer())
        .post('/auth/register/phone')
        .send({ phone: payload, password: payload })
        .expect(400);
    });
  });

  describe('comentario legítimo que contiene texto de inyección', () => {
    it('se guarda literal (201), sin afectar la tabla testimonials', async () => {
      const countBefore = await prisma.testimonials.count();

      // 20+ palabras válidas que contienen, en el medio, un payload de
      // inyección clásico — tiene que pasar (ninguna de las reglas de
      // `comment` restringe esos símbolos, solo HTML/URLs/spam/cantidad de
      // palabras) y quedar guardado tal cual, sin ejecutar nada.
      const comment =
        'Excelente atención en toda la clínica, el equipo fue muy ' +
        "profesional y atento durante todo el tratamiento Robert'); " +
        'DROP TABLE testimonials;-- que me realizaron hace poco y quedé ' +
        'completamente satisfecha con el resultado final.';

      const response = await request(app.getHttpServer())
        .post('/public/testimonials')
        .send({ name: 'Laura', treatment: 'Limpieza dental', comment })
        .expect(201);

      const body = response.body as { id: string };
      const id = body.id;
      expect(id).toBeDefined();

      const row = await prisma.testimonials.findUnique({ where: { id } });
      expect(row).not.toBeNull();
      // El comment quedó literal — ni el "DROP TABLE" ni el resto del
      // payload se interpretaron como SQL, es texto plano guardado tal cual
      // se mandó (Prisma parametriza).
      expect(row?.comment).toBe(comment);

      // La tabla testimonials sigue existiendo (si "DROP TABLE" se hubiera
      // ejecutado de verdad, este count directamente tiraría un error de
      // Prisma en vez de devolver un número) y el conteo de filas es el
      // esperado: exactamente una fila más que antes.
      const countAfter = await prisma.testimonials.count();
      expect(countAfter).toBe(countBefore + 1);

      await prisma.testimonials.delete({ where: { id } });
    });
  });
});
