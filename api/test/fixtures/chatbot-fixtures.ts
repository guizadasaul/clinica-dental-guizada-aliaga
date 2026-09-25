import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../src/shared/prisma/prisma.service';

/**
 * Datos de la suite de autorización del chatbot (CLI-95). Todo se marca con
 * el dominio de email FIXTURE_DOMAIN para poder limpiarlo (también lo que
 * haya quedado de una corrida abortada) sin tocar nada más de la base.
 */

export const FIXTURE_DOMAIN = '@e2e-chatbot.test';
const DAY_MS = 24 * 60 * 60 * 1000;

type FixtureRole = 'patient' | 'odontologist' | 'admin';

export interface FixtureUser {
  id: string;
  authUserId: string;
  token: string;
}

export interface ChatbotFixtures {
  patientA: FixtureUser & { patientId: string };
  patientB: FixtureUser & { patientId: string };
  doctor1: FixtureUser;
  doctor2: FixtureUser;
  admin: FixtureUser;
  inactiveDoctor: FixtureUser;
  /** Día (YYYY-MM-DD, hora de Bolivia) de las citas confirmadas futuras. */
  appointmentDay: string;
}

/** Nombres y montos de B / doctor 2: nunca deberían verlos A ni el doctor 1. */
export const PATIENT_A = { firstName: 'Ana', lastName: 'Arce' };
export const PATIENT_B = { firstName: 'Beto', lastName: 'Bravo' };
export const DOCTOR_1_NAME = 'Doctora Uno E2E';
export const DOCTOR_2_NAME = 'Doctor Dos E2E';
/** A: presupuesto de 500 con un pago de 200. B: presupuesto de 900 sin pagos. */
export const A_QUOTE = { total: 500, paid: 200 };
export const B_QUOTE = { total: 900 };

function clinicDay(date: Date): string {
  // America/La_Paz es UTC-4 fijo (sin horario de verano).
  return new Date(date.getTime() - 4 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

async function createUser(
  prisma: PrismaService,
  key: string,
  role: FixtureRole,
  displayName: string,
  isActive = true,
): Promise<FixtureUser> {
  const authUserId = randomUUID();
  const user = await prisma.users.create({
    data: {
      auth_user_id: authUserId,
      email: `${key}${FIXTURE_DOMAIN}`,
      display_name: displayName,
      phone: '+59170000000',
      role,
      is_active: isActive,
    },
  });
  return { id: user.id, authUserId, token: `token-${key}` };
}

export async function cleanupChatbotFixtures(
  prisma: PrismaService,
): Promise<void> {
  const users = await prisma.users.findMany({
    where: { email: { endsWith: FIXTURE_DOMAIN } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) return;
  const patientWhere = { patients: { user_id: { in: userIds } } };
  // chat_sessions/chat_messages caen en cascada al borrar el usuario.
  await prisma.payments.deleteMany({ where: { quotes: patientWhere } });
  await prisma.quotes.deleteMany({ where: patientWhere });
  await prisma.appointments.deleteMany({
    where: { OR: [{ doctor_id: { in: userIds } }, patientWhere] },
  });
  await prisma.patients.deleteMany({ where: { user_id: { in: userIds } } });
  await prisma.users.deleteMany({ where: { id: { in: userIds } } });
}

export async function createChatbotFixtures(
  prisma: PrismaService,
): Promise<ChatbotFixtures> {
  await cleanupChatbotFixtures(prisma);

  // idx_one_admin_user: si ya hay un admin, esta no es una base de test.
  const existingAdmin = await prisma.users.findFirst({
    where: { role: 'admin' },
  });
  if (existingAdmin) {
    throw new Error(
      'La base ya tiene un admin: corré los e2e contra una base de test propia, nunca la compartida.',
    );
  }

  const doctor1 = await createUser(
    prisma,
    'doctor1',
    'odontologist',
    DOCTOR_1_NAME,
  );
  const doctor2 = await createUser(
    prisma,
    'doctor2',
    'odontologist',
    DOCTOR_2_NAME,
  );
  const admin = await createUser(prisma, 'admin', 'admin', 'Admin E2E');
  const inactiveDoctor = await createUser(
    prisma,
    'inactive-doctor',
    'odontologist',
    'Doctor Inactivo E2E',
    false,
  );
  const userA = await createUser(prisma, 'patient-a', 'patient', 'Ana Arce');
  const userB = await createUser(prisma, 'patient-b', 'patient', 'Beto Bravo');

  const patientA = await prisma.patients.create({
    data: {
      user_id: userA.id,
      first_name: PATIENT_A.firstName,
      last_name_paternal: PATIENT_A.lastName,
      assigned_doctor_id: doctor1.id,
    },
  });
  const patientB = await prisma.patients.create({
    data: {
      user_id: userB.id,
      first_name: PATIENT_B.firstName,
      last_name_paternal: PATIENT_B.lastName,
      assigned_doctor_id: doctor2.id,
    },
  });

  const appointmentDay = clinicDay(new Date(Date.now() + 2 * DAY_MS));
  await prisma.appointments.createMany({
    data: [
      {
        patient_id: patientA.id,
        doctor_id: doctor1.id,
        appointment_datetime: new Date(`${appointmentDay}T10:00:00-04:00`),
        status: 'confirmed',
        source: 'public_web',
      },
      {
        patient_id: patientB.id,
        doctor_id: doctor2.id,
        appointment_datetime: new Date(`${appointmentDay}T11:00:00-04:00`),
        status: 'confirmed',
        source: 'public_web',
      },
    ],
  });

  const quoteA = await prisma.quotes.create({
    data: {
      patient_id: patientA.id,
      total_amount: A_QUOTE.total,
      total_paid: A_QUOTE.paid,
      status: 'partially_paid',
    },
  });
  await prisma.payments.create({
    data: { quote_id: quoteA.id, amount: A_QUOTE.paid, payment_method: 'cash' },
  });
  await prisma.quotes.create({
    data: { patient_id: patientB.id, total_amount: B_QUOTE.total },
  });

  return {
    patientA: { ...userA, patientId: patientA.id },
    patientB: { ...userB, patientId: patientB.id },
    doctor1,
    doctor2,
    admin,
    inactiveDoctor,
    appointmentDay,
  };
}
