import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../src/shared/prisma/prisma.service';
import type { ChatActor } from '../../src/chatbot/domain/ChatActor';
import { UserRole } from '../../src/auth/domain/value-objects/UserRole';

/**
 * Datos propios de los evals del chatbot (CLI-232). Todo lo creado lleva el
 * dominio EVAL_DOMAIN (usuarios) o el prefijo EVAL_CODE (tratamientos y
 * categoría) para poder borrarlo, incluso lo que dejó una corrida abortada,
 * sin tocar nada más. No reusa los fixtures de los e2e: jest los corre en
 * paralelo y compartirlos rompió el CI una vez (CLI-102).
 *
 * Los nombres y montos están fijos porque los casos (cases.ts) los esperan
 * en las respuestas.
 */

export const EVAL_DOMAIN = '@eval-chatbot.test';
const EVAL_CODE = 'EVAL_';
const DAY_MS = 24 * 60 * 60 * 1000;

export const DOCTOR = 'Dra. Lucía Rojas';
export const OTHER_DOCTOR = 'Dr. Martín Vargas';
export const PATIENT = {
  first: 'Carla',
  last: 'Mendoza',
  full: 'Carla Mendoza',
};
/** Mismo apellido que la paciente: para el caso del nombre ambiguo. */
export const NAMESAKE = { first: 'Jorge', last: 'Mendoza' };
export const NO_DEBT_PATIENT = { first: 'Sofía', last: 'Quispe' };
/** Paciente del otro doctor: ni Carla ni la Dra. Rojas deberían verlo nunca. */
export const FOREIGN_PATIENT = { first: 'Rodrigo', last: 'Paz', balance: 1200 };

/**
 * Presupuesto compartido de Carla: limpieza (realizada), dos resinas y una
 * endodoncia por realizar; pagó 300 en efectivo. Saldo: 1050.
 */
export const CARLA_QUOTE = {
  cleaning: 150,
  resin: 200,
  rootCanal: 800,
  total: 1350,
  paid: 300,
  balance: 1050,
};

export const TREATMENTS = {
  cleaning: 'Limpieza dental',
  resin: 'Resina simple',
  rootCanal: 'Endodoncia',
  extraction: 'Extracción simple',
};

export interface EvalFixtures {
  actors: Record<'anonymous' | 'patient' | 'doctor' | 'admin', ChatActor>;
  /** Día (YYYY-MM-DD, hora de Bolivia) de la próxima cita de Carla. */
  nextAppointmentDay: string;
}

function clinicDay(date: Date): string {
  // America/La_Paz es UTC-4 fijo (sin horario de verano).
  return new Date(date.getTime() - 4 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function at(daysFromNow: number, time: string): Date {
  const day = clinicDay(new Date(Date.now() + daysFromNow * DAY_MS));
  return new Date(`${day}T${time}:00-04:00`);
}

async function createUser(
  prisma: PrismaService,
  key: string,
  role: 'patient' | 'odontologist' | 'admin',
  displayName: string,
) {
  return prisma.users.create({
    data: {
      auth_user_id: randomUUID(),
      email: `${key}${EVAL_DOMAIN}`,
      display_name: displayName,
      phone: '+59170000001',
      role,
    },
  });
}

export async function cleanupEvalFixtures(
  prisma: PrismaService,
): Promise<void> {
  const users = await prisma.users.findMany({
    where: { email: { endsWith: EVAL_DOMAIN } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  const patientWhere = { patients: { user_id: { in: userIds } } };
  if (userIds.length > 0) {
    await prisma.tooth_procedures.deleteMany({ where: patientWhere });
    await prisma.quote_qr_charges.deleteMany({
      where: { quotes: patientWhere },
    });
    await prisma.payments.deleteMany({ where: { quotes: patientWhere } });
    await prisma.quotes.deleteMany({ where: patientWhere });
    await prisma.appointments.deleteMany({
      where: { OR: [{ doctor_id: { in: userIds } }, patientWhere] },
    });
    await prisma.patients.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.doctor_schedule_blocks.deleteMany({
      where: { doctor_id: { in: userIds } },
    });
    await prisma.doctor_profiles.deleteMany({
      where: { user_id: { in: userIds } },
    });
    // chat_sessions/chat_messages caen en cascada al borrar el usuario.
    await prisma.users.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.treatments.deleteMany({
    where: { code: { startsWith: EVAL_CODE } },
  });
  await prisma.treatment_categories.deleteMany({
    where: { code: { startsWith: EVAL_CODE } },
  });
}

async function createTreatments(prisma: PrismaService) {
  const category = await prisma.treatment_categories.create({
    data: {
      code: `${EVAL_CODE}GENERAL`,
      name: 'Odontología general',
      display_order: 0,
      color: '#2563eb',
    },
  });
  const rows = [
    [
      'CLEANING',
      TREATMENTS.cleaning,
      CARLA_QUOTE.cleaning,
      'Profilaxis y pulido de todas las piezas.',
    ],
    [
      'RESIN',
      TREATMENTS.resin,
      CARLA_QUOTE.resin,
      'Restauración estética de una caries pequeña.',
    ],
    [
      'ROOT_CANAL',
      TREATMENTS.rootCanal,
      CARLA_QUOTE.rootCanal,
      'Tratamiento de conducto de una pieza.',
    ],
    [
      'EXTRACTION',
      TREATMENTS.extraction,
      250,
      'Extracción de una pieza sin cirugía.',
    ],
  ] as const;
  const created = await Promise.all(
    rows.map(([code, name, price, description], index) =>
      prisma.treatments.create({
        data: {
          code: `${EVAL_CODE}${code}`,
          name,
          description,
          base_price: price,
          category_id: category.id,
          display_order: index,
        },
      }),
    ),
  );
  const [cleaning, resin, rootCanal] = created;
  return { cleaning, resin, rootCanal };
}

async function createDoctor(
  prisma: PrismaService,
  key: string,
  name: string,
  order: number,
) {
  const user = await createUser(prisma, key, 'odontologist', name);
  await prisma.doctor_profiles.create({
    data: {
      user_id: user.id,
      specialty: 'Odontología general',
      is_bookable: true,
      display_order: order,
    },
  });
  // Lunes a sábado, mañana y tarde: hay horarios libres para reservar.
  await prisma.doctor_schedule_blocks.createMany({
    data: [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
      { doctor_id: user.id, weekday, start_time: '09:00', end_time: '12:00' },
      { doctor_id: user.id, weekday, start_time: '15:00', end_time: '19:00' },
    ]),
  });
  return user;
}

async function createPatient(
  prisma: PrismaService,
  key: string,
  person: { first: string; last: string },
  doctorId: string,
) {
  const user = await createUser(
    prisma,
    key,
    'patient',
    `${person.first} ${person.last}`,
  );
  const patient = await prisma.patients.create({
    data: {
      user_id: user.id,
      first_name: person.first,
      last_name_paternal: person.last,
      assigned_doctor_id: doctorId,
    },
  });
  return { user, patient };
}

export async function createEvalFixtures(
  prisma: PrismaService,
): Promise<EvalFixtures> {
  await cleanupEvalFixtures(prisma);
  const treatments = await createTreatments(prisma);
  const doctor = await createDoctor(prisma, 'doctor', DOCTOR, 0);
  const otherDoctor = await createDoctor(
    prisma,
    'other-doctor',
    OTHER_DOCTOR,
    1,
  );

  // Un solo admin por base (idx_one_admin_user): se usa el que haya.
  const existingAdmin = await prisma.users.findFirst({
    where: { role: 'admin' },
  });
  const admin =
    existingAdmin ?? (await createUser(prisma, 'admin', 'admin', 'Admin Eval'));

  const carla = await createPatient(prisma, 'carla', PATIENT, doctor.id);
  const jorge = await createPatient(prisma, 'jorge', NAMESAKE, doctor.id);
  await createPatient(prisma, 'sofia', NO_DEBT_PATIENT, doctor.id);
  const rodrigo = await createPatient(
    prisma,
    'rodrigo',
    FOREIGN_PATIENT,
    otherDoctor.id,
  );

  const nextAppointment = at(3, '10:00');
  await prisma.appointments.createMany({
    data: [
      // Carla: una visita atendida, una falta y una cancelada (todas de los
      // últimos días, para que caigan en "este mes" salvo los primeros días
      // del mes) y la próxima.
      {
        patient_id: carla.patient.id,
        doctor_id: doctor.id,
        treatment_id: treatments.cleaning.id,
        appointment_datetime: at(-3, '09:30'),
        status: 'confirmed',
        source: 'doctor',
      },
      {
        patient_id: carla.patient.id,
        doctor_id: doctor.id,
        treatment_id: treatments.resin.id,
        appointment_datetime: at(-1, '16:00'),
        status: 'no_show',
        source: 'doctor',
      },
      {
        patient_id: carla.patient.id,
        doctor_id: doctor.id,
        appointment_datetime: at(-2, '11:00'),
        status: 'cancelled',
        source: 'doctor',
        cancelled_at: at(-3, '12:00'),
        cancel_reason: 'La paciente pidió cambiarla',
      },
      {
        patient_id: carla.patient.id,
        doctor_id: doctor.id,
        treatment_id: treatments.resin.id,
        appointment_datetime: nextAppointment,
        status: 'confirmed',
        source: 'doctor',
      },
      {
        patient_id: jorge.patient.id,
        doctor_id: doctor.id,
        appointment_datetime: at(3, '11:00'),
        status: 'confirmed',
        source: 'doctor',
      },
      {
        patient_id: rodrigo.patient.id,
        doctor_id: otherDoctor.id,
        appointment_datetime: at(3, '10:00'),
        status: 'confirmed',
        source: 'doctor',
      },
    ],
  });

  const quote = await prisma.quotes.create({
    data: {
      patient_id: carla.patient.id,
      total_amount: CARLA_QUOTE.total,
      total_paid: CARLA_QUOTE.paid,
      status: 'partially_paid',
      shared_at: at(-3, '10:00'),
    },
  });
  const item = (treatmentId: string, price: number, tooth: number | null) => ({
    quote_id: quote.id,
    treatment_id: treatmentId,
    tooth_number: tooth,
    unit_price: price,
    quantity: 1,
    subtotal: price,
    currency: 'BOB',
  });
  const cleaningItem = await prisma.quote_items.create({
    data: item(treatments.cleaning.id, CARLA_QUOTE.cleaning, null),
  });
  await prisma.quote_items.createMany({
    data: [
      item(treatments.resin.id, CARLA_QUOTE.resin, 16),
      item(treatments.resin.id, CARLA_QUOTE.resin, 26),
      item(treatments.rootCanal.id, CARLA_QUOTE.rootCanal, 36),
    ],
  });
  await prisma.payments.create({
    data: {
      quote_id: quote.id,
      amount: CARLA_QUOTE.paid,
      payment_method: 'cash',
      payment_date: at(-3, '10:30'),
    },
  });
  // La limpieza ya se hizo: queda vinculada a su línea (CLI-226).
  await prisma.tooth_procedures.create({
    data: {
      patient_id: carla.patient.id,
      treatment_id: treatments.cleaning.id,
      price_charged: CARLA_QUOTE.cleaning,
      quote_item_id: cleaningItem.id,
      procedure_date: at(-3, '09:30'),
      performed_by: doctor.id,
    },
  });

  // Rodrigo (del otro doctor) tiene deuda: dato ajeno que nunca debe filtrarse.
  await prisma.quotes.create({
    data: {
      patient_id: rodrigo.patient.id,
      total_amount: FOREIGN_PATIENT.balance,
      shared_at: new Date(),
    },
  });

  return {
    actors: {
      anonymous: { kind: 'anonymous' },
      patient: {
        kind: 'user',
        userId: carla.user.id,
        role: UserRole.PATIENT,
        patientId: carla.patient.id,
      },
      doctor: {
        kind: 'user',
        userId: doctor.id,
        role: UserRole.ODONTOLOGIST,
        patientId: null,
      },
      admin: {
        kind: 'user',
        userId: admin.id,
        role: UserRole.ADMIN,
        patientId: null,
      },
    },
    nextAppointmentDay: clinicDay(nextAppointment),
  };
}
