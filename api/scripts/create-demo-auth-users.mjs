// Crea (o encuentra) en Supabase Auth las 3 cuentas de demo con email +
// contraseña, ya confirmadas — no se manda ningún correo, así que los
// @example.com no necesitan existir. Idempotente: si la cuenta ya existe, no
// la recrea; solo imprime su uid y deja su nombre al día.
//
// Uso (desde api/, con SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el .env):
//   DEMO_PASSWORD='...' node --env-file=.env scripts/create-demo-auth-users.mjs
// DEMO_PASSWORD solo hace falta al crear una cuenta nueva.
//
// Los uid impresos van fijos en prisma/seed-demo.ts (DEMO_USERS). La
// contraseña NO se guarda en el repo: se pasa por entorno y se entrega aparte.
import { createClient } from '@supabase/supabase-js';

// `fullName` tiene que coincidir con `displayName` de DEMO_USERS en
// prisma/seed-demo.ts: en cada login, POST /auth/sync copia el full_name de
// Supabase sobre users.display_name, así que si difieren, el nombre del seed
// se pisa en el primer ingreso (y se ve en la web pública).
const DEMO_ACCOUNTS = [
  { email: 'pavel@example.com', fullName: 'Pavel Rojas' },
  { email: 'juan@example.com', fullName: 'Juan Pérez' },
  { email: 'mariano@example.com', fullName: 'Mariano Vargas' },
];

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_PASSWORD } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.',
  );
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

for (const { email, fullName } of DEMO_ACCOUNTS) {
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
  if (!DEMO_PASSWORD) {
    console.error(`✗ ${email} no existe y falta DEMO_PASSWORD para crearla.`);
    process.exit(1);
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) {
    console.error(`✗ ${email}: ${error.message}`);
    process.exit(1);
  }
  console.log(`+ ${email} creado → ${data.user.id}`);
}
