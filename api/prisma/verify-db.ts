// Verificación de solo lectura después de migrar/sembrar un ambiente remoto
// (lo corre .github/workflows/db-migrate.yml como último paso). Imprime
// conteos y nombres de tablas — nunca datos de filas ni la connection string
// — y termina con código 1 si algo no quedó como tiene que quedar:
//   - alguna carpeta de prisma/migrations sin aplicar, o una migración fallida
//   - alguna tabla de `public` sin RLS (en Supabase, `public` se publica por
//     la Data API: ver la migración enable_rls_all_public_tables)
//   - algún catálogo del seed vacío
//
// Uso: npx ts-node prisma/verify-db.ts   (con DATABASE_URL y, contra
// Supabase, DATABASE_SSL_CA en el entorno)
import 'dotenv/config';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { pgConnectionConfig } from '../src/shared/prisma/pg-connection';

const CATALOG_TABLES = [
  'treatment_categories',
  'treatments',
  'diagnosis_categories',
  'diagnoses',
  'medical_conditions',
  'tooth_surfaces',
] as const;

const MIGRATIONS_DIR = join(__dirname, 'migrations');

function localMigrationNames(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter((entry) =>
    statSync(join(MIGRATIONS_DIR, entry)).isDirectory(),
  );
}

async function main(): Promise<void> {
  const client = new Client(pgConnectionConfig());
  await client.connect();
  const problems: string[] = [];

  try {
    const { rows: applied } = await client.query<{ migration_name: string }>(
      `SELECT migration_name FROM _prisma_migrations
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    const { rows: failed } = await client.query<{ migration_name: string }>(
      `SELECT migration_name FROM _prisma_migrations
       WHERE finished_at IS NULL AND rolled_back_at IS NULL`,
    );
    const appliedNames = new Set(applied.map((row) => row.migration_name));
    const pending = localMigrationNames().filter(
      (name) => !appliedNames.has(name),
    );
    console.log(`Migraciones aplicadas: ${appliedNames.size}`);
    if (pending.length > 0) {
      problems.push(`Migraciones sin aplicar: ${pending.join(', ')}`);
    }
    if (failed.length > 0) {
      problems.push(
        `Migraciones fallidas: ${failed.map((row) => row.migration_name).join(', ')}`,
      );
    }

    const { rows: withoutRls } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public' AND NOT rowsecurity
       ORDER BY tablename`,
    );
    const { rows: tableCount } = await client.query<{ count: string }>(
      `SELECT count(*) FROM pg_tables WHERE schemaname = 'public'`,
    );
    console.log(
      `Tablas en public: ${tableCount[0].count} (sin RLS: ${withoutRls.length})`,
    );
    if (withoutRls.length > 0) {
      problems.push(
        `Tablas sin RLS: ${withoutRls.map((row) => row.tablename).join(', ')}`,
      );
    }

    for (const table of CATALOG_TABLES) {
      const { rows } = await client.query<{ count: string }>(
        `SELECT count(*) FROM public.${table}`,
      );
      console.log(`Catálogo ${table}: ${rows[0].count} filas`);
      if (Number(rows[0].count) === 0) {
        problems.push(`Catálogo vacío: ${table}`);
      }
    }

    const { rows: users } = await client.query<{ count: string }>(
      'SELECT count(*) FROM public.users',
    );
    console.log(`Usuarios: ${users[0].count}`);
  } finally {
    await client.end();
  }

  if (problems.length > 0) {
    console.error(`\n✗ La base no quedó bien:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  console.log('\n✓ Base verificada');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
