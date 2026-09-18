// Carga api/.env al correr fuera de Docker (npm run seed:demo), igual que
// prisma.config.ts hace para `prisma db seed`. Dentro de Docker no pisa nada.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import type { UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] });
const prisma = new PrismaClient({ adapter });

/**
 * Cuentas de demo para quien evalúa el proyecto: una por rol. Solo se
 * siembran con SEED_DEMO=true (ver docker/entrypoint.sh) — nunca en la base
 * de desarrollo real, que ya tiene su propio administrador.
 *
 * `authUserId` es el uid de la identidad en Supabase Auth, creada una sola
 * vez con scripts/create-demo-auth-users.mjs. Son identificadores públicos,
 * no secretos; la contraseña no vive en el repo.
 */
const DEMO_USERS: Record<
  'doctor' | 'patient' | 'admin',
  { authUserId: string; email: string; displayName: string; role: UserRole }
> = {
  doctor: {
    authUserId: '19554b22-46dd-4589-8e6c-270c82b69a6a',
    email: 'pavel@example.com',
    displayName: 'Pavel Rojas',
    role: 'odontologist',
  },
  patient: {
    authUserId: 'bfcb9c00-db63-4b40-8fc9-a5b14be849e7',
    email: 'juan@example.com',
    displayName: 'Juan Pérez',
    role: 'patient',
  },
  admin: {
    authUserId: '5f4b0ac5-61f9-4e2a-af66-554fa6cf7bd3',
    email: 'mariano@example.com',
    displayName: 'Mariano Vargas',
    role: 'admin',
  },
};

async function upsertUser(demo: (typeof DEMO_USERS)[keyof typeof DEMO_USERS]) {
  return prisma.users.upsert({
    where: { auth_user_id: demo.authUserId },
    update: {
      email: demo.email,
      display_name: demo.displayName,
      role: demo.role,
      is_active: true,
    },
    create: {
      auth_user_id: demo.authUserId,
      email: demo.email,
      display_name: demo.displayName,
      role: demo.role,
    },
  });
}

async function seedAdmin() {
  // Hay un índice único parcial: solo puede existir un admin por base. Si ya
  // hay otro (una base real, no un clon limpio), se respeta y no se pisa.
  const otherAdmin = await prisma.users.findFirst({
    where: {
      role: 'admin',
      auth_user_id: { not: DEMO_USERS.admin.authUserId },
    },
  });
  if (otherAdmin) {
    console.log(
      '! Ya existe otro administrador en esta base — se omite el admin de demo.',
    );
    return;
  }
  await upsertUser(DEMO_USERS.admin);
  console.log(`✓ Administrador de demo: ${DEMO_USERS.admin.email}`);
}

async function seedDoctor() {
  const user = await upsertUser(DEMO_USERS.doctor);
  await prisma.doctor_profiles.upsert({
    where: { user_id: user.id },
    update: {},
    create: {
      user_id: user.id,
      specialty: 'Odontología general y rehabilitación oral',
      bio: 'Odontólogo de demostración para evaluar el flujo del doctor: agenda, fichas de pacientes, odontograma, tratamientos y cobros.',
      is_bookable: true,
      display_order: 0,
    },
  });
  // Sin bloques horarios el doctor figura en /reservar pero sin ningún turno
  // (isValidSlot rechaza todo). Solo se cargan si no tiene ninguno, para no
  // pisar cambios hechos después desde el panel de administración.
  const existingBlocks = await prisma.doctor_schedule_blocks.count({
    where: { doctor_id: user.id },
  });
  if (existingBlocks === 0) {
    const weekdays = [1, 2, 3, 4, 5]; // lunes a viernes (0 = domingo)
    await prisma.doctor_schedule_blocks.createMany({
      data: weekdays.flatMap((weekday) => [
        { doctor_id: user.id, weekday, start_time: '09:00', end_time: '13:00' },
        { doctor_id: user.id, weekday, start_time: '15:00', end_time: '19:00' },
      ]),
    });
  }
  console.log(`✓ Doctor de demo: ${DEMO_USERS.doctor.email}`);
  return user;
}

async function seedPatient(doctorUserId: string) {
  const user = await upsertUser(DEMO_USERS.patient);
  await prisma.patients.upsert({
    where: { user_id: user.id },
    update: {},
    create: {
      user_id: user.id,
      first_name: 'Juan',
      last_name_paternal: 'Pérez',
      last_name_maternal: 'Quispe',
      birth_date: new Date('1994-05-12'),
      sex: 'masculino',
      occupation: 'Ingeniero de sistemas',
      ciudad: 'La Paz',
      zona: 'Sopocachi',
      address: 'Av. 6 de Agosto, edificio de prueba',
      document_type: 'ci',
      dni: '9999999',
      consultation_reason: 'Control general y limpieza dental.',
      assigned_doctor_id: doctorUserId,
    },
  });
  console.log(`✓ Paciente de demo: ${DEMO_USERS.patient.email}`);
}

async function main() {
  await seedAdmin();
  const doctor = await seedDoctor();
  await seedPatient(doctor.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
