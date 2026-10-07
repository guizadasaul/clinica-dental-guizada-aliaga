// Carga api/.env al correr fuera de Docker (npm run seed:sample), igual que
// seed-demo.ts. Dentro de Docker no pisa nada.
import 'dotenv/config';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { pgConnectionConfig } from '../src/shared/prisma/pg-connection';
import {
  insertQuoteItems,
  recalculateQuote,
} from '../src/quotes/infrastructure/persistence/quote-writes';

/**
 * Datos de muestra para staging y la base local (CLI-202): 3 doctores, 40
 * pacientes con historial clínico, presupuestos en todos los estados,
 * tratamientos realizados y agendas llenas, con fechas relativas a hoy.
 *
 * NUNCA en producción: se niega a correr con APP_ENV=production o si
 * DATABASE_URL/SUPABASE_URL apuntan al proyecto de Supabase de producción, y
 * db-migrate.yml rechaza pedirlo para `production`.
 *
 * Re-ejecutable: todo lo sembrado cuelga de usuarios con email
 * @muestra.example.com; cada corrida borra solo eso y lo vuelve a crear
 * (mismos nombres por la semilla fija, fechas corridas a hoy). Los doctores
 * de muestra no se borran (tienen FKs RESTRICT): se actualizan.
 *
 * Las cuentas con login (2 doctores + 12 pacientes) existen en el Supabase
 * Auth de staging, creadas con scripts/create-sample-auth-users.mjs; sus uid
 * van fijos acá. Pavel es el doctor de demo de seed-demo.ts (mismo uid).
 */

const SAMPLE_DOMAIN = 'muestra.example.com';
const PRODUCTION_SUPABASE_REF = 'vmeigxwssmsaagqgaysl';
const USD_TO_BOB = 6.96;
const SLOT_MINUTES = 30;
const DAY_MS = 86_400_000;

function assertNotProduction(env: NodeJS.ProcessEnv): void {
  if (env['APP_ENV'] === 'production') {
    throw new Error(
      'seed-sample no se corre en producción (APP_ENV=production)',
    );
  }
  for (const name of ['DATABASE_URL', 'SUPABASE_URL']) {
    if (env[name]?.includes(PRODUCTION_SUPABASE_REF)) {
      throw new Error(
        `seed-sample no se corre en producción (${name} apunta al Supabase de producción)`,
      );
    }
  }
}

// ── Aleatoriedad determinista (mulberry32) ───────────────────────────────

let prngState = 20261005;
function rand(): number {
  prngState = (prngState + 0x6d2b79f5) | 0;
  let t = prngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (min: number, max: number) =>
  min + Math.floor(rand() * (max - min + 1));
const chance = (p: number) => rand() < p;
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)];
}
function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Fechas (la clínica está en America/La_Paz, UTC-4 fijo) ───────────────

function clinicToday(): string {
  return new Date(Date.now() - 4 * 3_600_000).toISOString().slice(0, 10);
}
function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}
function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS,
  );
}
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const at = (date: string, time: string) => new Date(`${date}T${time}:00-04:00`);
const dateOnly = (date: string) => new Date(`${date}T00:00:00Z`);
const toMinutes = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const randomTime = (fromHour: number, toHour: number) =>
  `${String(randInt(fromHour, toHour)).padStart(2, '0')}:${pick(['00', '15', '30', '45'])}`;
const fromMinutes = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// ── Doctores ─────────────────────────────────────────────────────────────

type Block = [weekday: number, start: string, end: string];

interface DoctorSeed {
  key: 'pavel' | 'lucia' | 'andres';
  authUserId: string;
  email: string;
  displayName: string;
  /** Pavel es del seed de demo: su perfil y horario solo se crean si faltan. */
  isSample: boolean;
  profile: Omit<Prisma.doctor_profilesUncheckedCreateInput, 'user_id'>;
  blocks: Block[];
}

const weekdays = (from: number, to: number, start: string, end: string) =>
  Array.from({ length: to - from + 1 }, (_, i): Block => [
    from + i,
    start,
    end,
  ]);

const DOCTORS: DoctorSeed[] = [
  {
    key: 'pavel',
    authUserId: '19554b22-46dd-4589-8e6c-270c82b69a6a',
    email: 'pavel@example.com',
    displayName: 'Pavel Rojas',
    isSample: false,
    profile: {
      specialty: 'Odontología general y rehabilitación oral',
      bio: 'Odontólogo de demostración para evaluar el flujo del doctor: agenda, fichas de pacientes, odontograma, tratamientos y cobros.',
      is_bookable: true,
      display_order: 0,
    },
    blocks: [
      ...weekdays(1, 5, '09:00', '13:00'),
      ...weekdays(1, 5, '15:00', '19:00'),
    ],
  },
  {
    key: 'lucia',
    authUserId: '6df4762e-63d7-45b5-94ba-7bf54d84cb5b',
    email: `lucia.mamani@${SAMPLE_DOMAIN}`,
    displayName: 'Lucía Mamani',
    isSample: true,
    profile: {
      first_name: 'Lucía',
      last_name_paternal: 'Mamani',
      last_name_maternal: 'Choque',
      specialty: 'Ortodoncia y odontopediatría',
      bio: 'Doctora de muestra. Atiende a niños y adolescentes, y lleva los tratamientos de ortodoncia de la clínica.',
      is_bookable: true,
      display_order: 1,
      color: '#db2777',
    },
    blocks: [
      ...weekdays(1, 5, '08:30', '12:30'),
      [2, '15:00', '18:00'],
      [4, '15:00', '18:00'],
      [6, '09:00', '13:00'],
    ],
  },
  {
    key: 'andres',
    authUserId: '3b1bbe1f-c074-4ed0-95e3-1621ceaa3e9b',
    email: `andres.quiroga@${SAMPLE_DOMAIN}`,
    displayName: 'Andrés Quiroga',
    isSample: true,
    profile: {
      first_name: 'Andrés',
      last_name_paternal: 'Quiroga',
      last_name_maternal: 'Salazar',
      specialty: 'Endodoncia y cirugía oral',
      bio: 'Doctor de muestra. Tratamientos de conducto, extracciones de terceros molares y cirugía menor.',
      is_bookable: true,
      display_order: 2,
      color: '#059669',
    },
    blocks: [...weekdays(1, 5, '14:00', '20:00'), [3, '09:00', '12:00']],
  },
];

// ── Pacientes ────────────────────────────────────────────────────────────

type PatientSpec = [
  first: string,
  paternal: string,
  maternal: string,
  sex: 'F' | 'M',
  birthYear: number,
];

/** Los 12 primeros tienen cuenta real (mismo orden que create-sample-auth-users.mjs). */
const PATIENTS: PatientSpec[] = [
  ['María Fernanda', 'Quispe', 'Huanca', 'F', 1990],
  ['Carlos Alberto', 'Mendoza', 'Rojas', 'M', 1985],
  ['Ana Lucía', 'Gutiérrez', 'Flores', 'F', 1998],
  ['Jorge Luis', 'Condori', 'Mamani', 'M', 1976],
  ['Valeria', 'Soria', 'Vargas', 'F', 2001],
  ['Diego Alejandro', 'Arce', 'Paredes', 'M', 1993],
  ['Gabriela', 'Torrez', 'Calle', 'F', 1982],
  ['Luis Fernando', 'Villca', 'Apaza', 'M', 1969],
  ['Camila Andrea', 'Rocha', 'Salinas', 'F', 2008],
  ['Rodrigo', 'Chávez', 'Laura', 'M', 1995],
  ['Patricia', 'Limachi', 'Ticona', 'F', 1974],
  ['Marco Antonio', 'Zeballos', 'Cruz', 'M', 1988],
  ['Daniela', 'Pinto', 'Aguilar', 'F', 1999],
  ['José Miguel', 'Ramos', 'Copa', 'M', 1958],
  ['Natalia', 'Céspedes', 'Ortiz', 'F', 1987],
  ['Fernando', 'Blanco', 'Siles', 'M', 1980],
  ['Sofía Alejandra', 'Mercado', 'Lima', 'F', 2014],
  ['Javier', 'Ortega', 'Chura', 'M', 1971],
  ['Carla Patricia', 'Vaca', 'Suárez', 'F', 1992],
  ['Miguel Ángel', 'Poma', 'Quisbert', 'M', 2003],
  ['Lorena', 'Ibáñez', 'Medina', 'F', 1966],
  ['Óscar', 'Huarachi', 'Callisaya', 'M', 1979],
  ['Paola Andrea', 'Saavedra', 'Rivero', 'F', 1996],
  ['Ricardo', 'Peña', 'Arteaga', 'M', 1963],
  ['Mariela', 'Choque', 'Alanoca', 'F', 1985],
  ['Andrés Felipe', 'Gemio', 'Rada', 'M', 2010],
  ['Rosa Elena', 'Tarqui', 'Nina', 'F', 1951],
  ['Sebastián', 'Montaño', 'Ugarte', 'M', 2000],
  ['Verónica', 'Loayza', 'Bustillos', 'F', 1977],
  ['Héctor', 'Mamani', 'Yujra', 'M', 1946],
  ['Claudia', 'Escobar', 'Prado', 'F', 1989],
  ['Iván', 'Gonzales', 'Terrazas', 'M', 1984],
  ['Lucía Belén', 'Fernández', 'Antezana', 'F', 2017],
  ['Raúl', 'Velasco', 'Choquehuanca', 'M', 1972],
  ['Silvia', 'Rojas', 'Guzmán', 'F', 1960],
  ['Mauricio', 'Cardozo', 'Vela', 'M', 1997],
  ['Jimena', 'Aliaga', 'Torrico', 'F', 1994],
  ['Pablo', 'Quiroz', 'Salvatierra', 'M', 1968],
  ['Andrea', 'Murillo', 'Tapia', 'F', 2005],
  ['Eduardo', 'Sanjinés', 'Paz', 'M', 1955],
];

/** uid de Supabase Auth (staging) de los pacientes con cuenta, por email. */
const PATIENT_AUTH_UIDS: Record<string, string> = {
  [`maria.quispe@${SAMPLE_DOMAIN}`]: '4cc96963-7ad0-4ae1-8de4-0c692805e4f9',
  [`carlos.mendoza@${SAMPLE_DOMAIN}`]: 'd152620e-ce25-43cf-9565-ea792c01c5f0',
  [`ana.gutierrez@${SAMPLE_DOMAIN}`]: '540e179f-034c-4372-bc11-f875f46728f8',
  [`jorge.condori@${SAMPLE_DOMAIN}`]: 'bb22868b-9336-431c-a90c-2f9685c7d7fb',
  [`valeria.soria@${SAMPLE_DOMAIN}`]: '81bac5e2-6674-4f59-85ef-e62086ed64ea',
  [`diego.arce@${SAMPLE_DOMAIN}`]: '09a7e2d6-2f18-4e56-9e7d-677e1e281044',
  [`gabriela.torrez@${SAMPLE_DOMAIN}`]: 'b744e19a-7ccc-4447-a11e-cb769868a830',
  [`luis.villca@${SAMPLE_DOMAIN}`]: '32b84dee-502a-440b-9b33-ee1671617a63',
  [`camila.rocha@${SAMPLE_DOMAIN}`]: '8f2a55fa-4acf-4e54-9dac-d0fe4fc013a9',
  [`rodrigo.chavez@${SAMPLE_DOMAIN}`]: '0f717a24-4219-456d-9f84-f0f68eb66e16',
  [`patricia.limachi@${SAMPLE_DOMAIN}`]: 'd85419af-3b63-46c9-9f82-4252a6021b66',
  [`marco.zeballos@${SAMPLE_DOMAIN}`]: '192efec9-5b7f-4936-aa4a-06459376fd62',
};

const ACCOUNT_COUNT = 12;
const INVITE_COUNT = 6;

const CITIES: { ciudad: string; zonas: string[]; weight: number }[] = [
  {
    ciudad: 'La Paz',
    zonas: [
      'Sopocachi',
      'Miraflores',
      'San Pedro',
      'Obrajes',
      'Calacoto',
      'Villa Fátima',
      'Achumani',
    ],
    weight: 0.65,
  },
  {
    ciudad: 'El Alto',
    zonas: ['Ciudad Satélite', 'Villa Adela', 'Río Seco', '16 de Julio'],
    weight: 0.2,
  },
  { ciudad: 'Cochabamba', zonas: ['Cala Cala', 'Queru Queru'], weight: 0.1 },
  { ciudad: 'Santa Cruz', zonas: ['Equipetrol'], weight: 0.05 },
];
const STREETS = [
  'Av. 6 de Agosto',
  'Calle Landaeta',
  'Av. Arce',
  'Calle 21',
  'Av. Ballivián',
  'Calle Jaimes Freyre',
  'Av. Juan Pablo II',
  'Calle Sagárnaga',
  'Av. Busch',
];
const OCCUPATIONS = [
  'Contadora',
  'Ingeniero civil',
  'Profesora',
  'Comerciante',
  'Abogado',
  'Enfermera',
  'Chofer',
  'Arquitecta',
  'Médico',
  'Administradora',
  'Diseñador gráfico',
  'Policía',
  'Secretaria',
  'Ingeniero de sistemas',
];
const REASONS = [
  'Dolor en una muela al masticar.',
  'Control general y limpieza dental.',
  'Sensibilidad al frío en los dientes de abajo.',
  'Sangrado de encías al cepillarse.',
  'Quiere blanquearse los dientes.',
  'Se le rompió un diente de adelante.',
  'Control de ortodoncia y evaluación de brackets.',
  'Le duele la muela del juicio.',
  'Revisión de rutina, hace años que no va al dentista.',
  'Mal aliento y sarro.',
];
const RELATIONSHIPS = [
  'Madre',
  'Padre',
  'Esposo',
  'Esposa',
  'Hermano',
  'Hermana',
  'Hija',
  'Hijo',
];
const GUEST_FIRST = [
  'Martha',
  'Alejandro',
  'Roxana',
  'Wilson',
  'Jhoselin',
  'Gonzalo',
  'Ximena',
  'Freddy',
  'Brenda',
  'Marcelo',
  'Elizabeth',
  'René',
  'Noemí',
  'Hugo',
  'Tatiana',
  'Ronald',
  'Fabiola',
  'Edwin',
  'Karen',
  'Limberth',
];
const GUEST_LAST = [
  'Apaza',
  'Mamani',
  'Flores',
  'Gutiérrez',
  'Quispe',
  'Choque',
  'Vargas',
  'Rojas',
  'Ticona',
  'Copa',
  'Cruz',
  'Salinas',
  'Aguilar',
  'Nina',
  'Laura',
];
const CANCEL_REASONS = [
  'El paciente pidió reprogramar',
  'Viaje imprevisto',
  'Se sintió mal',
  'Cruce con su horario de trabajo',
];
const BRUSHING = [
  'once_daily',
  'twice_daily',
  'thrice_daily',
  'more_than_thrice',
  'occasionally',
] as const;

function slug(text: string): string {
  return text.split(' ')[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
const patientEmail = ([first, paternal]: PatientSpec) =>
  `${slug(first)}.${slug(paternal)}@${SAMPLE_DOMAIN}`;

// ── Hallazgos → tratamientos ─────────────────────────────────────────────

const MOLARS = [16, 17, 26, 27, 36, 37, 46, 47];
const PREMOLARS = [14, 15, 24, 25, 34, 35, 44, 45];
const INCISORS = [11, 12, 21, 22, 31, 32, 41, 42];
const THIRD_MOLARS = [18, 28, 38, 48];
const DECIDUOUS_MOLARS = [54, 55, 64, 65, 74, 75, 84, 85];
const BLACK_CLASSES = [
  'clase_i',
  'clase_ii',
  'clase_iii',
  'clase_iv',
  'clase_v',
];

interface FindingRule {
  diagnosis: string;
  teeth: number[];
  treatment: (tooth: number) => string;
  surfaces?: string[];
  deciduous?: boolean;
}

const ADULT_FINDINGS: FindingRule[] = [
  {
    diagnosis: 'caries_primer_grado',
    teeth: [...MOLARS, ...PREMOLARS],
    treatment: () => 'restauracion_caries_simple',
    surfaces: ['occlusal'],
  },
  {
    diagnosis: 'caries_segundo_grado',
    teeth: [...MOLARS, ...PREMOLARS],
    treatment: () => 'restauracion_caries_compuesta',
    surfaces: ['occlusal', 'mesial'],
  },
  {
    diagnosis: 'caries_tercer_grado',
    teeth: [...MOLARS, ...PREMOLARS],
    treatment: (t) =>
      MOLARS.includes(t)
        ? 'conducto_multirradicular'
        : 'conducto_unirradicular',
  },
  {
    diagnosis: 'resto_radicular',
    teeth: [...MOLARS, ...PREMOLARS],
    treatment: () => 'extraccion_simple',
  },
  {
    diagnosis: 'obturacion_amalgama_recidivante',
    teeth: MOLARS,
    treatment: () => 'restauracion_caries_compuesta',
    surfaces: ['occlusal', 'distal'],
  },
  {
    diagnosis: 'fractura_incisal',
    teeth: INCISORS,
    treatment: () => 'restauracion_caries_compuesta',
    surfaces: ['incisal', 'vestibular'],
  },
  {
    diagnosis: 'endodoncia_fractura',
    teeth: [...MOLARS, ...PREMOLARS],
    treatment: () => 'corona_porcelana_metal_plastico',
  },
  {
    diagnosis: 'retencion_dental',
    teeth: THIRD_MOLARS,
    treatment: () => 'extraccion_tercer_molar',
  },
  {
    diagnosis: 'pericoronaritis',
    teeth: [38, 48],
    treatment: () => 'operculectomia',
  },
];
const CHILD_FINDINGS: FindingRule[] = [
  {
    diagnosis: 'caries_primer_grado',
    teeth: DECIDUOUS_MOLARS,
    treatment: () => 'resina_diente_temporal',
    surfaces: ['occlusal'],
    deciduous: true,
  },
  {
    diagnosis: 'caries_segundo_grado',
    teeth: DECIDUOUS_MOLARS,
    treatment: () => 'resina_diente_temporal',
    surfaces: ['occlusal', 'distal'],
    deciduous: true,
  },
];

interface PlanItem {
  code: string;
  teeth: number[];
  quantity?: number;
  surfaces?: string[];
}

// ── Catálogos ────────────────────────────────────────────────────────────

interface TreatmentRow {
  id: string;
  code: string;
  base_price: Prisma.Decimal;
  currency: string;
  estimated_minutes: number;
  application_type: string;
}

const adapter = new PrismaPg(pgConnectionConfig());
const prisma = new PrismaClient({ adapter });

async function loadCatalogs() {
  const [treatmentRows, diagnosisRows, conditionRows] = await Promise.all([
    prisma.treatments.findMany(),
    prisma.diagnoses.findMany({ select: { id: true, code: true } }),
    prisma.medical_conditions.findMany({ select: { id: true, code: true } }),
  ]);
  const treatments = new Map<string, TreatmentRow>(
    treatmentRows.map((t) => [t.code, t]),
  );
  const diagnoses = new Map(diagnosisRows.map((d) => [d.code, d.id]));
  const conditions = new Map(conditionRows.map((c) => [c.code, c.id]));
  const consultation =
    treatmentRows.find((t) => t.is_default_consultation) ??
    treatments.get('consulta_odontologica');
  if (!consultation || diagnoses.size === 0 || conditions.size === 0) {
    throw new Error(
      'Faltan los catálogos: corre primero `npx prisma db seed`.',
    );
  }
  const treatment = (code: string): TreatmentRow => {
    const row = treatments.get(code);
    if (!row) {
      throw new Error(`Tratamiento ${code} no está en el catálogo`);
    }
    return row;
  };
  const diagnosis = (code: string): string => {
    const id = diagnoses.get(code);
    if (!id) {
      throw new Error(`Diagnóstico ${code} no está en el catálogo`);
    }
    return id;
  };
  return { treatment, diagnosis, conditions, consultation };
}
type Catalogs = Awaited<ReturnType<typeof loadCatalogs>>;

// ── Limpieza de la corrida anterior ──────────────────────────────────────

async function cleanup() {
  const marker = { endsWith: `@${SAMPLE_DOMAIN}` };
  const patientIds = (
    await prisma.patients.findMany({
      where: { users: { email: marker, role: 'patient' } },
      select: { id: true },
    })
  ).map((p) => p.id);
  const [appointments, , quotes, patients, users] = await prisma.$transaction([
    prisma.appointments.deleteMany({
      where: {
        OR: [{ patient_id: { in: patientIds } }, { guest_email: marker }],
      },
    }),
    prisma.payments.deleteMany({
      where: { quotes: { patient_id: { in: patientIds } } },
    }),
    prisma.quotes.deleteMany({ where: { patient_id: { in: patientIds } } }),
    // Cascada: historia médica, exámenes, procedimientos, invitaciones.
    prisma.patients.deleteMany({ where: { id: { in: patientIds } } }),
    prisma.users.deleteMany({ where: { email: marker, role: 'patient' } }),
    prisma.doctor_time_blocks.deleteMany({
      where: { users: { email: marker } },
    }),
  ]);
  console.log(
    `− Corrida anterior borrada: ${users.count} usuarios, ${patients.count} pacientes, ${quotes.count} presupuestos, ${appointments.count} citas.`,
  );
}

// ── Doctores ─────────────────────────────────────────────────────────────

interface DoctorRef {
  seed: DoctorSeed;
  id: string;
}

async function seedDoctors(): Promise<DoctorRef[]> {
  const refs: DoctorRef[] = [];
  for (const doctor of DOCTORS) {
    const user = await prisma.users.upsert({
      where: { auth_user_id: doctor.authUserId },
      update: {
        email: doctor.email,
        display_name: doctor.displayName,
        role: 'odontologist',
        is_active: true,
      },
      create: {
        auth_user_id: doctor.authUserId,
        email: doctor.email,
        display_name: doctor.displayName,
        role: 'odontologist',
      },
    });
    await prisma.doctor_profiles.upsert({
      where: { user_id: user.id },
      update: doctor.isSample ? doctor.profile : {},
      create: { user_id: user.id, ...doctor.profile },
    });
    const existingBlocks = await prisma.doctor_schedule_blocks.count({
      where: { doctor_id: user.id },
    });
    if (doctor.isSample || existingBlocks === 0) {
      await prisma.doctor_schedule_blocks.deleteMany({
        where: { doctor_id: user.id },
      });
      await prisma.doctor_schedule_blocks.createMany({
        data: doctor.blocks.map(([weekday, start_time, end_time]) => ({
          doctor_id: user.id,
          weekday,
          start_time,
          end_time,
        })),
      });
    }
    refs.push({ seed: doctor, id: user.id });
  }
  console.log(`✓ ${refs.length} doctores con perfil y horario.`);
  return refs;
}

// ── Presupuestos ─────────────────────────────────────────────────────────

type QuoteKind = 'paid' | 'partial' | 'pending' | 'draft';

interface QuoteLine {
  treatment: TreatmentRow;
  tooth: number | null;
  groupId: string | null;
  /** CLI-230: la fila del presupuesto que cumple el procedimiento. */
  quoteItemId: string;
  price: number;
  quantity: number;
  surfaces: string[];
}

function unitPrice(t: TreatmentRow): number {
  const base = Number(t.base_price);
  return t.currency === 'USD' ? round2(base * USD_TO_BOB) : base;
}

/** Montos que suman `total`, redondeados a 10 Bs salvo el último. */
function splitAmount(total: number, parts: number): number[] {
  const amounts: number[] = [];
  let left = total;
  for (let i = 0; i < parts - 1; i += 1) {
    const amount = Math.max(10, Math.round(left / (parts - i) / 10) * 10);
    if (amount >= left) {
      break;
    }
    amounts.push(amount);
    left = round2(left - amount);
  }
  amounts.push(left);
  return amounts;
}

async function createQuote(
  cat: Catalogs,
  patientId: string,
  createdDate: string,
  today: string,
  items: PlanItem[],
  kind: QuoteKind,
  notes: string | null,
): Promise<QuoteLine[]> {
  const createdAt = at(createdDate, randomTime(9, 18));
  const quote = await prisma.quotes.create({
    data: {
      patient_id: patientId,
      notes,
      created_at: createdAt,
      updated_at: createdAt,
      shared_at: kind === 'draft' ? null : createdAt,
    },
  });
  const lines: QuoteLine[] = [];
  for (const item of items) {
    const t = cat.treatment(item.code);
    const price = unitPrice(t);
    const exchange = t.currency === 'USD' ? USD_TO_BOB : null;
    const surfaces = item.surfaces ?? [];
    if (t.application_type === 'multiple_teeth') {
      const group = await prisma.application_groups.create({
        data: {
          quote_id: quote.id,
          treatment_id: t.id,
          unit_price: price,
          subtotal: price,
          currency: t.currency,
          exchange_rate: exchange,
        },
      });
      const rows = await prisma.quote_items.createManyAndReturn({
        data: [...item.teeth]
          .sort((a, b) => a - b)
          .map((tooth) => ({
            quote_id: quote.id,
            treatment_id: t.id,
            tooth_number: tooth,
            application_group_id: group.id,
          })),
        select: { id: true, tooth_number: true },
      });
      for (const tooth of item.teeth) {
        lines.push({
          treatment: t,
          tooth,
          groupId: group.id,
          quoteItemId: rows.find((r) => r.tooth_number === tooth)!.id,
          price: 0,
          quantity: 1,
          surfaces,
        });
      }
      lines[lines.length - 1].price = price;
      continue;
    }
    const quantity =
      t.application_type === 'single_tooth' ? 1 : (item.quantity ?? 1);
    for (const tooth of t.application_type === 'single_tooth'
      ? item.teeth
      : [null]) {
      const row = await prisma.quote_items.create({
        data: {
          quote_id: quote.id,
          treatment_id: t.id,
          tooth_number: tooth,
          unit_price: price,
          quantity,
          subtotal: round2(price * quantity),
          currency: t.currency,
          exchange_rate: exchange,
        },
        select: { id: true },
      });
      lines.push({
        treatment: t,
        tooth,
        groupId: null,
        quoteItemId: row.id,
        price: round2(price * quantity),
        quantity,
        surfaces,
      });
    }
  }
  const total = round2(lines.reduce((sum, l) => sum + l.price, 0));

  let paidTarget = 0;
  if (kind === 'paid') {
    paidTarget = total;
  } else if (kind === 'partial') {
    paidTarget = Math.max(
      10,
      Math.round((total * (0.3 + rand() * 0.4)) / 10) * 10,
    );
  }
  const payments = paidTarget > 0 ? splitAmount(paidTarget, randInt(1, 3)) : [];
  const span = Math.max(1, daysBetween(createdDate, today) - 1);
  for (const [index, amount] of payments.entries()) {
    const day = addDays(
      createdDate,
      Math.min(span, Math.round(((index + 1) * span) / (payments.length + 1))),
    );
    const paidAt = at(day, randomTime(9, 19));
    const qr = chance(0.35);
    await prisma.payments.create({
      data: {
        quote_id: quote.id,
        amount,
        payment_method: qr ? 'qr_baneco' : 'cash',
        notes: qr ? 'QR BANECO (muestra)' : null,
        payment_date: paidAt,
        created_at: paidAt,
      },
    });
  }
  const totalPaid = round2(payments.reduce((s, a) => s + a, 0));
  let status = 'pending';
  if (totalPaid > 0) {
    status = totalPaid >= total ? 'paid' : 'partially_paid';
  }
  await prisma.quotes.update({
    where: { id: quote.id },
    data: { total_amount: total, total_paid: totalPaid, status },
  });

  // Lo realizado: completo si está pagado, una parte si es pago parcial y, en
  // los pendientes, a veces algo hecho que todavía se debe (CLI-221).
  // Un grupo de varias piezas se realiza entero (CLI-230): si no, su línea
  // del presupuesto nunca queda realizada.
  const units = treatmentUnits(lines);
  let performed: QuoteLine[][] = [];
  if (kind === 'paid') {
    performed = units;
  } else if (kind === 'partial') {
    performed = units.slice(
      0,
      Math.max(1, Math.floor(units.length * (totalPaid / total))),
    );
  } else if (kind === 'pending' && chance(0.6)) {
    performed = units.slice(0, randInt(1, Math.max(1, units.length - 1)));
  }
  return performed.flat();
}

/** Las líneas agrupadas por tratamiento: las piezas de un grupo juntas. */
function treatmentUnits(lines: QuoteLine[]): QuoteLine[][] {
  const units = new Map<string, QuoteLine[]>();
  for (const line of lines) {
    const key = line.groupId ?? line.quoteItemId;
    units.set(key, [...(units.get(key) ?? []), line]);
  }
  return [...units.values()];
}

/** Una visita de tratamiento planeada: el día y lo que se hace ese día. */
interface PlannedVisit {
  date: string;
  lines: QuoteLine[];
}

/**
 * Reparte lo realizado en visitas entre `fromDate` y hoy. Todavía no crea
 * nada: el procedimiento se registra recién cuando la cita tiene turno, con
 * el día real y el doctor de la cita (CLI-221), así "Mis citas" y "Mi
 * historial" cuentan lo mismo.
 */
function planVisits(
  fromDate: string,
  today: string,
  lines: QuoteLine[],
): PlannedVisit[] {
  const span = Math.max(1, daysBetween(fromDate, today) - 1);
  const byDate = new Map<string, QuoteLine[]>();
  const units = treatmentUnits(lines);
  for (const [index, unit] of units.entries()) {
    const date = addDays(
      fromDate,
      Math.min(span, 1 + Math.floor(((index + 1) * span) / (units.length + 1))),
    );
    byDate.set(date, [...(byDate.get(date) ?? []), ...unit]);
  }
  return [...byDate.entries()].map(([date, dayLines]) => ({
    date,
    lines: dayLines,
  }));
}

/** Registra lo hecho en una visita atendida: mismo día y mismo doctor que la cita. */
async function createProcedures(
  patientId: string,
  doctorId: string,
  date: string,
  lines: QuoteLine[],
): Promise<void> {
  for (const line of lines) {
    await prisma.tooth_procedures.create({
      data: {
        patient_id: patientId,
        tooth_number: line.tooth,
        application_group_id: line.groupId,
        treatment_id: line.treatment.id,
        price_charged: line.groupId ? null : line.price,
        quantity: line.quantity,
        procedure_date: dateOnly(date),
        performed_by: doctorId,
        quote_item_id: line.quoteItemId,
        created_at: at(date, '12:00'),
        tooth_procedure_surfaces:
          line.tooth && line.surfaces.length
            ? {
                create: line.surfaces.map((code) => ({
                  tooth_surfaces: { connect: { code } },
                })),
              }
            : undefined,
      },
    });
  }
}

/**
 * Una urgencia que no estaba en el plan (CLI-230): como al registrarla desde
 * la app (CLI-226), se suma al presupuesto abierto del paciente — o a uno
 * nuevo —, que queda compartido, con el procedimiento ya vinculado.
 */
async function addUnplannedTreatment(
  cat: Catalogs,
  patientId: string,
  doctorId: string,
  date: string,
): Promise<boolean> {
  const t = cat.treatment('emergencia_odontologica');
  const planned = await prisma.quote_items.count({
    where: { treatment_id: t.id, quotes: { patient_id: patientId } },
  });
  if (planned > 0) {
    return false;
  }
  const price = unitPrice(t);
  const when = at(date, '12:00');
  await prisma.$transaction(async (tx) => {
    const open = await tx.quotes.findFirst({
      where: {
        patient_id: patientId,
        status: { in: ['pending', 'partially_paid'] },
      },
      orderBy: { created_at: 'desc' },
      select: { id: true },
    });
    const quoteId =
      open?.id ??
      (
        await tx.quotes.create({
          data: {
            patient_id: patientId,
            shared_at: when,
            created_at: when,
            updated_at: when,
          },
          select: { id: true },
        })
      ).id;
    await tx.quotes.updateMany({
      where: { id: quoteId, shared_at: null },
      data: { shared_at: when },
    });
    const [item] = await insertQuoteItems(tx, quoteId, [
      {
        treatmentId: t.id,
        toothNumber: null,
        unitPrice: price,
        quantity: 1,
        subtotal: price,
        currency: t.currency,
        exchangeRate: t.currency === 'USD' ? USD_TO_BOB : null,
      },
    ]);
    await tx.tooth_procedures.create({
      data: {
        patient_id: patientId,
        treatment_id: t.id,
        price_charged: price,
        procedure_date: dateOnly(date),
        performed_by: doctorId,
        quote_item_id: item.id,
        created_at: when,
      },
    });
    await recalculateQuote(tx, quoteId);
  });
  return true;
}

/** Día (en Bolivia) de un turno. */
const clinicDateOf = (slot: Date) =>
  new Date(slot.getTime() - 4 * 3_600_000).toISOString().slice(0, 10);

// ── Pacientes con historial ──────────────────────────────────────────────

interface PatientRef {
  id: string;
  doctorId: string;
  name: string;
  createdDate: string;
  /** Día del examen inicial: la primera visita, una consulta. */
  examDate: string;
  /** Visitas de tratamiento; cada una registra sus procedimientos al tener turno. */
  plannedVisits: PlannedVisit[];
  pendingCodes: string[];
  performedCodes: string[];
}

function pickFindings(
  isChild: boolean,
): { rule: FindingRule; tooth: number }[] {
  const rules = isChild ? CHILD_FINDINGS : ADULT_FINDINGS;
  const used = new Set<number>();
  const findings: { rule: FindingRule; tooth: number }[] = [];
  const count = randInt(2, isChild ? 3 : 5);
  for (let attempt = 0; findings.length < count && attempt < 20; attempt += 1) {
    const rule = pick(rules);
    const tooth = pick(rule.teeth);
    if (!used.has(tooth)) {
      used.add(tooth);
      findings.push({ rule, tooth });
    }
  }
  return findings;
}

async function seedPatient(
  cat: Catalogs,
  spec: PatientSpec,
  index: number,
  doctor: DoctorRef,
  today: string,
): Promise<PatientRef> {
  const [first, paternal, maternal, sexCode, birthYear] = spec;
  const age = Number(today.slice(0, 4)) - birthYear;
  const isChild = age < 12;
  const email = patientEmail(spec);
  const createdDate = addDays(today, -randInt(45, 360));
  const createdAt = at(createdDate, '10:00');
  const cityRoll = rand();
  let acc = 0;
  const city = CITIES.find((c) => (acc += c.weight) >= cityRoll) ?? CITIES[0];
  const elderly = age >= 60;
  const conditionCodes = shuffle(
    elderly
      ? ['hipertension', 'diabetes', 'problemas_cardiacos', 'reumatismo']
      : ['alergias', 'asma', 'anemia', 'ulceras'],
  ).slice(0, chance(elderly ? 0.85 : 0.35) ? randInt(1, 2) : 0);
  const medications: Prisma.patient_medicationsCreateWithoutPatientsInput[] =
    [];
  if (conditionCodes.includes('hipertension')) {
    medications.push({
      drug_name: 'Losartán',
      dose: '50 mg',
      frequency: 'Una vez al día',
    });
  }
  if (conditionCodes.includes('diabetes')) {
    medications.push({
      drug_name: 'Metformina',
      dose: '850 mg',
      frequency: 'Dos veces al día',
    });
  }
  if (conditionCodes.includes('asma')) {
    medications.push({
      drug_name: 'Salbutamol inhalador',
      dose: '100 mcg',
      frequency: 'Si hay crisis',
    });
  }

  const hasAccount = index < ACCOUNT_COUNT;
  const user = await prisma.users.create({
    data: {
      auth_user_id: hasAccount ? (PATIENT_AUTH_UIDS[email] ?? null) : null,
      email,
      display_name: `${first} ${paternal}`,
      role: 'patient',
      phone: chance(0.6)
        ? `+5917${String(1_000_000 + index * 48_271).slice(-7)}`
        : null,
      created_at: createdAt,
      updated_at: createdAt,
    },
  });
  const examDate = addDays(createdDate, randInt(0, 3));
  const patient = await prisma.patients.create({
    data: {
      user_id: user.id,
      first_name: first,
      last_name_paternal: paternal,
      last_name_maternal: maternal,
      birth_date: dateOnly(
        `${birthYear}-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`,
      ),
      birth_place: pick([
        'La Paz',
        'La Paz',
        'Oruro',
        'Cochabamba',
        'Potosí',
        'Santa Cruz',
      ]),
      sex: sexCode === 'F' ? 'femenino' : 'masculino',
      occupation:
        age < 19
          ? 'Estudiante'
          : elderly && chance(0.6)
            ? sexCode === 'F'
              ? 'Jubilada'
              : 'Jubilado'
            : pick(OCCUPATIONS),
      address: `${pick(STREETS)} N° ${randInt(100, 2999)}`,
      ciudad: city.ciudad,
      zona: pick(city.zonas),
      emergency_contact_first_name: pick(GUEST_FIRST),
      emergency_contact_last_name: paternal,
      emergency_contact_phone: `+5916${String(2_000_000 + index * 31_337).slice(-7)}`,
      emergency_contact_relationship: isChild
        ? pick(['Madre', 'Padre'])
        : pick(RELATIONSHIPS),
      consultation_reason: isChild
        ? 'Control de caries y limpieza.'
        : pick(REASONS),
      last_dentist_visit: chance(0.6)
        ? dateOnly(addDays(createdDate, -randInt(200, 1500)))
        : null,
      last_visit_treatment: chance(0.5)
        ? pick(['Limpieza', 'Curación', 'Extracción', 'Revisión'])
        : null,
      family_history: chance(0.3)
        ? pick([
            'Padre diabético',
            'Madre hipertensa',
            'Sin antecedentes relevantes',
          ])
        : null,
      document_type: 'ci',
      dni: `98${String(100_000 + index * 1237).padStart(6, '0')}`,
      assigned_doctor_id: doctor.id,
      created_at: createdAt,
      updated_at: createdAt,
      medical_history: {
        create: {
          other_diseases: chance(0.15)
            ? pick(['Gastritis', 'Migraña', 'Hipotiroidismo'])
            : null,
          anesthesia_reactions: chance(0.08),
        },
      },
      hygiene_habits: {
        create: {
          uses_toothbrush: true,
          brushing_frequency: pick(BRUSHING),
          uses_dental_floss: chance(0.35),
          uses_toothpick: chance(0.3),
          brushes_tongue: chance(0.5),
          uses_mouthwash: chance(0.4),
        },
      },
      patient_medical_conditions: {
        create: conditionCodes.map((code) => ({
          medical_condition_id: cat.conditions.get(code) ?? '',
          diagnosed_at: dateOnly(`${randInt(2010, 2024)}-0${randInt(1, 9)}-15`),
        })),
      },
      patient_medications: {
        create: medications.map((m) => ({
          ...m,
          started_at: dateOnly(`${randInt(2015, 2025)}-0${randInt(1, 9)}-01`),
        })),
      },
      clinical_exams: {
        create: [
          examDate,
          ...(chance(0.4) ? [addDays(examDate, randInt(60, 120))] : []),
        ]
          .filter((d) => d < today)
          .map((d) => ({
            exam_date: dateOnly(d),
            tartar: chance(0.5),
            saburra: chance(0.2),
            bacterial_plaque: chance(0.6),
            halitosis: chance(0.15),
            occlusion: pick(['Clase I', 'Clase I', 'Clase II', 'Clase III']),
          })),
      },
    },
  });

  if (index >= ACCOUNT_COUNT && index < ACCOUNT_COUNT + INVITE_COUNT) {
    await prisma.patient_invites.create({
      data: {
        user_id: user.id,
        patient_id: patient.id,
        channel: index % 2 === 0 ? 'email' : 'whatsapp',
        // Hash de un token que nadie conoce: la invitación figura pendiente
        // en la ficha pero no se puede usar.
        token_hash: createHash('sha256').update(randomBytes(32)).digest('hex'),
        expires_at: new Date(Date.now() + 3 * DAY_MS),
      },
    });
  }

  // Examen dental (odontograma de diagnóstico).
  const findings = pickFindings(isChild);
  await prisma.dental_exams.create({
    data: {
      patient_id: patient.id,
      version: 1,
      kind: 'diagnosis',
      recorded_by: doctor.id,
      recorded_at: at(examDate, '10:30'),
      notes: chance(0.3)
        ? 'Paciente colaborador, se explica el plan de tratamiento.'
        : null,
      dental_exam_findings: {
        create: findings.map(({ rule, tooth }) => ({
          diagnosis_id: cat.diagnosis(rule.diagnosis),
          tooth_number: tooth,
          tooth_type: rule.deciduous ? 'deciduous' : 'permanent',
          modifier_value:
            rule.diagnosis.startsWith('caries') ||
            rule.diagnosis.startsWith('obturacion')
              ? pick(BLACK_CLASSES)
              : null,
          xray_requested:
            rule.diagnosis.startsWith('caries_tercer') ||
            rule.diagnosis === 'retencion_dental',
        })),
      },
    },
  });

  // Plan de tratamiento: un ítem por hallazgo + limpieza / extras.
  const plan: PlanItem[] = findings.map(({ rule, tooth }) => ({
    code: rule.treatment(tooth),
    teeth: [tooth],
    surfaces: rule.surfaces,
  }));
  if (!isChild && chance(0.2)) {
    plan.push({ code: 'curetaje_periodontal', teeth: [31, 32, 41, 42] });
  }
  plan.push({
    code: chance(0.5)
      ? 'destartraje_limpieza_profilaxis_fluor'
      : 'limpieza_profilaxis_fluor',
    teeth: [],
  });
  if (!isChild && age < 45 && chance(0.15)) {
    plan.push({ code: 'blanqueamiento_dental_laser', teeth: [] });
  }
  if (age >= 65 && chance(0.5)) {
    plan.push({ code: 'placa_total_acrilico_superior', teeth: [] });
  }
  if (!isChild && age < 60 && chance(0.1)) {
    plan.push({ code: 'implante_dental', teeth: [pick([36, 46])] });
  }

  const kindRoll = rand();
  let kind: QuoteKind = 'draft';
  if (kindRoll < 0.35) {
    kind = 'paid';
  } else if (kindRoll < 0.65) {
    kind = 'partial';
  } else if (kindRoll < 0.87) {
    kind = 'pending';
  }
  const performed: QuoteLine[] = [];
  // Algunos pacientes antiguos ya tenían una limpieza pagada antes.
  if (daysBetween(createdDate, today) > 150 && chance(0.4)) {
    performed.push(
      ...(await createQuote(
        cat,
        patient.id,
        createdDate,
        addDays(createdDate, 30),
        [{ code: 'limpieza_profilaxis_fluor', teeth: [] }],
        'paid',
        'Control y limpieza inicial',
      )),
    );
  }
  const planDate =
    addDays(examDate, 1) < today ? addDays(examDate, 1) : examDate;
  performed.push(
    ...(await createQuote(
      cat,
      patient.id,
      planDate,
      today,
      plan,
      kind,
      kind === 'draft'
        ? 'Borrador: revisar con el paciente antes de compartir'
        : null,
    )),
  );
  // Ortodoncia: adolescentes y adultos jóvenes de la Dra. Mamani.
  if (doctor.seed.key === 'lucia' && age >= 11 && age <= 30 && chance(0.6)) {
    const candidate = addDays(planDate, randInt(5, 20));
    const orthoDate = candidate < today ? candidate : planDate;
    performed.push(
      ...(await createQuote(
        cat,
        patient.id,
        orthoDate,
        today,
        [
          { code: 'ortodoncia_brackets_metalicos', teeth: [] },
          { code: 'reposicion_arco', teeth: [], quantity: 2 },
        ],
        chance(0.7) ? 'partial' : 'pending',
        'Ortodoncia en cuotas mensuales',
      )),
    );
  }
  const performedIds = new Set(performed.map((l) => l.treatment.code));
  return {
    id: patient.id,
    doctorId: doctor.id,
    name: `${first} ${paternal}`,
    createdDate,
    examDate,
    plannedVisits: planVisits(planDate, today, performed),
    pendingCodes: plan.map((p) => p.code).filter((c) => !performedIds.has(c)),
    performedCodes: [...performedIds],
  };
}

// ── Citas ────────────────────────────────────────────────────────────────

class Agenda {
  private readonly taken = new Map<string, Set<number>>();
  private readonly offDays = new Map<string, Set<string>>();

  /** Horario real de cada doctor (el de la base, no el del seed: Pavel puede tener otro en staging). */
  constructor(private readonly blocks: Map<string, Block[]>) {}

  isFree(doctorId: string, start: Date, minutes: number): boolean {
    const taken = this.taken.get(doctorId);
    for (let m = 0; m < minutes; m += SLOT_MINUTES) {
      if (taken?.has(start.getTime() + m * 60_000)) {
        return false;
      }
    }
    return true;
  }

  markTaken(doctorId: string, start: Date, minutes: number) {
    const set = this.taken.get(doctorId) ?? new Set<number>();
    for (let m = 0; m < minutes; m += SLOT_MINUTES) {
      set.add(start.getTime() + m * 60_000);
    }
    this.taken.set(doctorId, set);
  }

  markOffDay(doctorId: string, date: string) {
    const set = this.offDays.get(doctorId) ?? new Set<string>();
    set.add(date);
    this.offDays.set(doctorId, set);
  }

  /** Inicios de turno libres del doctor en esa fecha, según su horario. */
  freeSlots(doctorId: string, date: string): Date[] {
    if (this.offDays.get(doctorId)?.has(date)) {
      return [];
    }
    const taken = this.taken.get(doctorId);
    const slots: Date[] = [];
    for (const [weekday, start, end] of this.blocks.get(doctorId) ?? []) {
      if (weekday !== weekdayOf(date)) {
        continue;
      }
      for (
        let m = toMinutes(start);
        m + SLOT_MINUTES <= toMinutes(end);
        m += SLOT_MINUTES
      ) {
        const slot = at(date, fromMinutes(m));
        if (!taken?.has(slot.getTime())) {
          slots.push(slot);
        }
      }
    }
    return slots;
  }

  /** Primer día desde `date` (hasta `limit` inclusive) con un turno libre. */
  findSlot(doctorId: string, date: string, limit: string): Date | null {
    for (let d = date; d <= limit; d = addDays(d, 1)) {
      const free = this.freeSlots(doctorId, d);
      if (free.length > 0) {
        return pick(free);
      }
    }
    return null;
  }
}

let guestCounter = 0;
function guestFields(
  source: string,
): Partial<Prisma.appointmentsCreateManyInput> {
  guestCounter += 1;
  const firstName = pick(GUEST_FIRST);
  const paternal = pick(GUEST_LAST);
  const maternal = pick(GUEST_LAST);
  const phone = `+5916${String(9_000_000 + guestCounter)}`;
  const fields: Partial<Prisma.appointmentsCreateManyInput> = {
    guest_first_name: firstName,
    guest_last_name_paternal: paternal,
    guest_last_name_maternal: maternal,
    guest_full_name: `${firstName} ${paternal} ${maternal}`,
    guest_phone: phone,
    guest_email: `invitado${guestCounter}@${SAMPLE_DOMAIN}`,
  };
  if (source === 'whatsapp') {
    fields.whatsapp_name = `${firstName} ${paternal}`;
    fields.whatsapp_phone = phone;
  }
  return fields;
}

async function seedAppointments(
  cat: Catalogs,
  doctors: DoctorRef[],
  patients: PatientRef[],
  today: string,
) {
  const now = new Date();
  const doctorIds = doctors.map((d) => d.id);
  const blockRows = await prisma.doctor_schedule_blocks.findMany({
    where: { doctor_id: { in: doctorIds } },
  });
  const blocks = new Map<string, Block[]>();
  for (const b of blockRows) {
    blocks.set(b.doctor_id, [
      ...(blocks.get(b.doctor_id) ?? []),
      [b.weekday, b.start_time, b.end_time],
    ]);
  }
  const agenda = new Agenda(blocks);
  /** Pacientes a los que ya se les tiró el dado de la urgencia fuera del plan (CLI-230). */
  const unplannedRolled = new Set<string>();
  const horizon = addDays(today, 42);

  // Lo que ya existe (citas reales de staging, otras corridas) no se pisa.
  const existing = await prisma.appointments.findMany({
    where: {
      doctor_id: { in: doctorIds },
      status: { not: 'cancelled' },
      appointment_datetime: { gte: at(addDays(today, -400), '00:00') },
    },
    select: {
      doctor_id: true,
      appointment_datetime: true,
      duration_minutes: true,
    },
  });
  for (const a of existing) {
    agenda.markTaken(a.doctor_id, a.appointment_datetime, a.duration_minutes);
  }

  // Un día bloqueado del Dr. Quiroga dentro de 3 semanas (congreso).
  const andres = doctors.find((d) => d.seed.key === 'andres');
  if (andres) {
    let congress = addDays(today, 17);
    while (weekdayOf(congress) !== 5) {
      congress = addDays(congress, 1);
    }
    await prisma.doctor_time_blocks.create({
      data: {
        doctor_id: andres.id,
        starts_at: at(congress, '00:00'),
        ends_at: at(congress, '23:59'),
        reason: 'Congreso de endodoncia',
      },
    });
    agenda.markOffDay(andres.id, congress);
  }

  const rows: Prisma.appointmentsCreateManyInput[] = [];
  const consultationPrice = unitPrice(cat.consultation);

  const push = (
    doctorId: string,
    slot: Date,
    treatment: TreatmentRow,
    patient: PatientRef | null,
    source: string,
    status: string,
  ) => {
    const duration = Math.max(SLOT_MINUTES, treatment.estimated_minutes);
    if (status !== 'cancelled') {
      agenda.markTaken(doctorId, slot, duration);
    }
    const createdAt = new Date(
      Math.min(slot.getTime() - randInt(1, 10) * DAY_MS, now.getTime()),
    );
    const row: Prisma.appointmentsCreateManyInput = {
      doctor_id: doctorId,
      patient_id: patient?.id ?? null,
      treatment_id: treatment.id,
      appointment_datetime: slot,
      duration_minutes: duration,
      status,
      source,
      created_at: createdAt,
      ...(patient ? {} : guestFields(source)),
    };
    if (source === 'public_web' && status !== 'expired') {
      row.payment_amount = consultationPrice;
      row.paid_at = new Date(createdAt.getTime() + 5 * 60_000);
    }
    if (status === 'expired') {
      row.hold_expires_at = new Date(createdAt.getTime() + 10 * 60_000);
    }
    if (status === 'cancelled') {
      row.cancelled_at = new Date(
        Math.min(slot.getTime() - DAY_MS, now.getTime()),
      );
      row.cancelled_by = doctorId;
      row.cancel_reason = pick(CANCEL_REASONS);
    }
    if (patient && chance(0.15)) {
      row.notes = pick([
        'Traer radiografía',
        'Control post tratamiento',
        'Paciente prefiere la mañana',
        'Recordar anestesia sin epinefrina',
      ]);
    }
    rows.push(row);
  };

  // Historial: la primera consulta + una cita por cada visita de tratamiento,
  // más algunas canceladas o vencidas. El procedimiento se registra con el
  // turno real (día y doctor de la cita) y el tratamiento de esa visita:
  // "Mis citas", "Mi historial" y la ficha del doctor coinciden (CLI-221).
  const yesterday = addDays(today, -1);
  for (const patient of patients) {
    if (patient.examDate <= yesterday) {
      const slot = agenda.findSlot(
        patient.doctorId,
        patient.examDate,
        yesterday,
      );
      if (slot) {
        push(
          patient.doctorId,
          slot,
          cat.consultation,
          patient,
          pick(['public_web', 'public_web', 'whatsapp', 'doctor']),
          'attended',
        );
      }
    }
    for (const visit of patient.plannedVisits) {
      if (visit.date > yesterday) {
        continue;
      }
      const slot = agenda.findSlot(patient.doctorId, visit.date, yesterday);
      if (!slot) {
        continue;
      }
      push(
        patient.doctorId,
        slot,
        visit.lines[0].treatment,
        patient,
        'doctor',
        'attended',
      );
      await createProcedures(
        patient.id,
        patient.doctorId,
        clinicDateOf(slot),
        visit.lines,
      );
      // A algunos pacientes (uno de cada cinco, en su primera visita de
      // tratamiento) el doctor les atendió además una urgencia.
      if (!unplannedRolled.has(patient.id)) {
        unplannedRolled.add(patient.id);
        if (chance(0.2)) {
          await addUnplannedTreatment(
            cat,
            patient.id,
            patient.doctorId,
            clinicDateOf(slot),
          );
        }
      }
    }
    for (let i = 0; i < randInt(0, 2); i += 1) {
      const date = addDays(
        patient.createdDate,
        randInt(1, Math.max(1, daysBetween(patient.createdDate, yesterday))),
      );
      const slot = agenda.findSlot(patient.doctorId, date, yesterday);
      if (slot) {
        const expired = chance(0.35);
        push(
          patient.doctorId,
          slot,
          cat.consultation,
          patient,
          expired ? 'public_web' : 'doctor',
          expired ? 'expired' : 'cancelled',
        );
      }
    }
  }

  // Agenda de hoy en adelante: las próximas 2 semanas bien llenas, después
  // más espaciado. Los turnos de hoy que ya pasaron quedan atendidos.
  const futureCount = new Map<string, number>();
  for (let d = today; d <= horizon; d = addDays(d, 1)) {
    const fill = daysBetween(today, d) <= 14 ? 0.75 : 0.3;
    for (const doctor of doctors) {
      const own = patients.filter((p) => p.doctorId === doctor.id);
      for (const slot of agenda.freeSlots(doctor.id, d)) {
        if (!chance(fill)) {
          continue;
        }
        const candidates = own.filter((p) => (futureCount.get(p.id) ?? 0) < 2);
        const patient =
          candidates.length && chance(0.45) ? pick(candidates) : null;
        if (patient) {
          futureCount.set(patient.id, (futureCount.get(patient.id) ?? 0) + 1);
        }
        let treatment = cat.consultation;
        // Un turno de hoy que ya pasó queda atendido: sin procedimiento
        // registrado, así que es una consulta (CLI-221).
        if (patient && slot >= now) {
          treatment = cat.treatment(
            pick(
              patient.pendingCodes.length
                ? patient.pendingCodes
                : ['limpieza_profilaxis_fluor'],
            ),
          );
        }
        if (
          !agenda.isFree(
            doctor.id,
            slot,
            Math.max(SLOT_MINUTES, treatment.estimated_minutes),
          )
        ) {
          continue;
        }
        let status = slot < now ? 'attended' : 'confirmed';
        if (status === 'confirmed' && chance(0.05)) {
          status = 'cancelled';
        }
        const source = patient
          ? pick(['doctor', 'doctor', 'public_web', 'whatsapp'])
          : pick(['public_web', 'public_web', 'whatsapp']);
        push(doctor.id, slot, treatment, patient, source, status);
      }
    }
  }

  for (let i = 0; i < rows.length; i += 200) {
    await prisma.appointments.createMany({ data: rows.slice(i, i + 200) });
  }
  const upcoming = rows.filter((r) => r.status === 'confirmed').length;
  console.log(
    `✓ ${rows.length} citas (${upcoming} confirmadas desde hoy, ${rows.length - upcoming} de historial o canceladas).`,
  );
}

async function main() {
  assertNotProduction(process.env);
  const today = clinicToday();
  const cat = await loadCatalogs();
  await cleanup();
  const doctors = await seedDoctors();
  const lucia = doctors.find((d) => d.seed.key === 'lucia') ?? doctors[0];

  const patients: PatientRef[] = [];
  for (const [index, spec] of PATIENTS.entries()) {
    const isKid = Number(today.slice(0, 4)) - spec[4] < 14;
    const doctor = isKid ? lucia : doctors[index % doctors.length];
    patients.push(await seedPatient(cat, spec, index, doctor, today));
  }
  console.log(
    `✓ ${patients.length} pacientes (${ACCOUNT_COUNT} con cuenta, ${INVITE_COUNT} con invitación pendiente) con historial, presupuestos y tratamientos.`,
  );

  await seedAppointments(cat, doctors, patients, today);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
