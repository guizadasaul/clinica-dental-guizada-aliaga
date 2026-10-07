// Crea (o encuentra) en Supabase Auth las cuentas de los datos de muestra
// (CLI-202): 2 doctores nuevos y 12 pacientes, con email + contraseña, ya
// confirmadas — no se manda ningún correo. Idempotente, igual que
// create-demo-auth-users.mjs: si la cuenta ya existe, no la recrea; solo
// imprime su uid y deja su nombre al día.
//
// Uso (desde api/, con SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del Supabase
// de STAGING en el .env — local usa el mismo Auth):
//   SAMPLE_PASSWORD='...' node --env-file=.env scripts/create-sample-auth-users.mjs
// SAMPLE_PASSWORD solo hace falta al crear una cuenta nueva.
//
// Los uid impresos van fijos en prisma/seed-sample.ts (SAMPLE_ACCOUNTS). La
// contraseña NO se guarda en el repo. Nunca contra el Supabase de producción.
import { createClient } from '@supabase/supabase-js';

const PRODUCTION_SUPABASE_REF = 'vmeigxwssmsaagqgaysl';

// `fullName` tiene que coincidir con el display_name de prisma/seed-sample.ts:
// POST /auth/sync copia el full_name de Supabase sobre users.display_name en
// cada login.
const SAMPLE_ACCOUNTS = [
  { email: 'lucia.mamani@muestra.example.com', fullName: 'Lucía Mamani' },
  { email: 'andres.quiroga@muestra.example.com', fullName: 'Andrés Quiroga' },
  {
    email: 'maria.quispe@muestra.example.com',
    fullName: 'María Fernanda Quispe',
  },
  {
    email: 'carlos.mendoza@muestra.example.com',
    fullName: 'Carlos Alberto Mendoza',
  },
  {
    email: 'ana.gutierrez@muestra.example.com',
    fullName: 'Ana Lucía Gutiérrez',
  },
  {
    email: 'jorge.condori@muestra.example.com',
    fullName: 'Jorge Luis Condori',
  },
  { email: 'valeria.soria@muestra.example.com', fullName: 'Valeria Soria' },
  { email: 'diego.arce@muestra.example.com', fullName: 'Diego Alejandro Arce' },
  { email: 'gabriela.torrez@muestra.example.com', fullName: 'Gabriela Torrez' },
  {
    email: 'luis.villca@muestra.example.com',
    fullName: 'Luis Fernando Villca',
  },
  {
    email: 'camila.rocha@muestra.example.com',
    fullName: 'Camila Andrea Rocha',
  },
  { email: 'rodrigo.chavez@muestra.example.com', fullName: 'Rodrigo Chávez' },
  {
    email: 'patricia.limachi@muestra.example.com',
    fullName: 'Patricia Limachi',
  },
  {
    email: 'marco.zeballos@muestra.example.com',
    fullName: 'Marco Antonio Zeballos',
  },
];

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SAMPLE_PASSWORD } =
  process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.',
  );
  process.exit(1);
}
if (SUPABASE_URL.includes(PRODUCTION_SUPABASE_REF)) {
  console.error('Los datos de muestra nunca se crean en producción.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findByEmail(email) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      throw error;
    }
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) {
      return match;
    }
    if (data.users.length < 200) {
      return null;
    }
  }
}

for (const { email, fullName } of SAMPLE_ACCOUNTS) {
  const existing = await findByEmail(email);
  if (existing) {
    if (existing.user_metadata?.full_name !== fullName) {
      const { error } = await supabase.auth.admin.updateUserById(existing.id, {
        user_metadata: { ...existing.user_metadata, full_name: fullName },
      });
      if (error) {
        console.error(`✗ ${email}: ${error.message}`);
        process.exit(1);
      }
      console.log(`~ ${email} ya existía, nombre actualizado → ${existing.id}`);
    } else {
      console.log(`= ${email} ya existía → ${existing.id}`);
    }
    continue;
  }
  if (!SAMPLE_PASSWORD) {
    console.error(`✗ ${email} no existe y falta SAMPLE_PASSWORD para crearla.`);
    process.exit(1);
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: SAMPLE_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) {
    console.error(`✗ ${email}: ${error.message}`);
    process.exit(1);
  }
  console.log(`+ ${email} creado → ${data.user.id}`);
}
