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
 * Selector de Finanzas (CLI-190): lista a todos los pacientes con ficha, los
 * últimos con tratamiento primero, y se puede buscar por nombre.
 */

const DOMAIN = '@e2e-cli190.test';
const LAST = 'Cli190';
const TREATMENT_CODE = 'e2e_cli190_treatment';
const CATEGORY_CODE = 'e2e_cli190';

interface ListedPatient {
  patientId: string;
  patientName: string;
  quoteId: string | null;
  balance: number;
  lastTreatmentAt: string | null;
}

describe('Lista de pacientes de Finanzas (e2e) — CLI-190', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let doctorId: string;
  const verifier = new FakeAccessTokenVerifier();
  const patientIds: Record<string, string> = {};

  async function cleanup(): Promise<void> {
    await prisma.tooth_procedures.deleteMany({
      where: { treatments: { code: TREATMENT_CODE } },
    });
    await prisma.treatments.deleteMany({ where: { code: TREATMENT_CODE } });
    await prisma.treatment_categories.deleteMany({
      where: { code: CATEGORY_CODE },
    });
    await prisma.patients.deleteMany({
      where: { users: { email: { endsWith: DOMAIN } } },
    });
    await prisma.users.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  }

  async function createUser(key: string, role: 'patient' | 'odontologist') {
    const authUserId = randomUUID();
    const user = await prisma.users.create({
      data: {
        auth_user_id: authUserId,
        email: `${key}${DOMAIN}`,
        role,
        display_name: key,
      },
    });
    verifier.register(`token-${key}`, authUserId);
    return user.id;
  }

  async function createPatient(key: string, first: string) {
    const userId = await createUser(key, 'patient');
    const patient = await prisma.patients.create({
      data: { user_id: userId, first_name: first, last_name_paternal: LAST },
    });
    patientIds[key] = patient.id;
  }

  const list = async (search?: string) =>
    (
      await request(app.getHttpServer())
        .get('/finances/patients')
        .query(search ? { search } : {})
        .set('Authorization', 'Bearer token-doctor')
        .expect(200)
    ).body as ListedPatient[];

  const mine = (rows: ListedPatient[]) =>
    rows.filter((r) => r.patientName.endsWith(LAST));

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
    doctorId = await createUser('doctor', 'odontologist');
    await createPatient('antiguo', 'Antiguo');
    await createPatient('reciente', 'Reciente');
    await createPatient('nunca', 'Nunca');
    await createPatient('eliminado', 'Eliminado');
    await prisma.patients.update({
      where: { id: patientIds['eliminado'] },
      data: { deleted_at: new Date() },
    });
  }, 60000);

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('lista a todos los pacientes con ficha, también sin presupuesto, y no a los eliminados', async () => {
    const rows = mine(await list());

    expect(rows.map((r) => r.patientName).sort()).toEqual([
      `Antiguo ${LAST}`,
      `Nunca ${LAST}`,
      `Reciente ${LAST}`,
    ]);
    for (const row of rows) {
      expect(row.quoteId).toBeNull();
      expect(row.balance).toBe(0);
    }
  });

  it('ordena por último tratamiento y deja al final a quien nunca tuvo uno', async () => {
    const category = await prisma.treatment_categories.create({
      data: {
        code: CATEGORY_CODE,
        name: 'Categoría E2E CLI-190',
        display_order: 998,
        color: '#000000',
      },
    });
    const treatment = await prisma.treatments.create({
      data: {
        code: TREATMENT_CODE,
        name: 'Tratamiento E2E CLI-190',
        base_price: 10,
        category_id: category.id,
      },
    });
    try {
      await prisma.tooth_procedures.createMany({
        data: [
          {
            patient_id: patientIds['antiguo'],
            tooth_number: 11,
            treatment_id: treatment.id,
            price_charged: 10,
            performed_by: doctorId,
            created_at: new Date('2026-01-10T10:00:00Z'),
          },
          {
            patient_id: patientIds['reciente'],
            tooth_number: 12,
            treatment_id: treatment.id,
            price_charged: 10,
            performed_by: doctorId,
            created_at: new Date('2026-02-10T10:00:00Z'),
          },
        ],
      });

      const rows = mine(await list());

      expect(rows.map((r) => r.patientName)).toEqual([
        `Reciente ${LAST}`,
        `Antiguo ${LAST}`,
        `Nunca ${LAST}`,
      ]);
      expect(rows[2].lastTreatmentAt).toBeNull();
    } finally {
      // Los reportes suman todas las tablas compartidas: no se deja nada acá.
      await prisma.tooth_procedures.deleteMany({
        where: { treatment_id: treatment.id },
      });
    }
  });

  it('el buscador encuentra por nombre y apellido juntos, sin importar tildes ni mayúsculas', async () => {
    const rows = await list(`  RECIENTE ${LAST.toLowerCase()} `);

    expect(rows.map((r) => r.patientName)).toEqual([`Reciente ${LAST}`]);
  });

  it('un paciente no puede ver la lista (403)', async () => {
    await createUser('paciente-sin-ficha', 'patient');
    await request(app.getHttpServer())
      .get('/finances/patients')
      .set('Authorization', 'Bearer token-paciente-sin-ficha')
      .expect(403);
  });
});
