import { readFileSync } from 'node:fs';

export interface PgConnectionConfig {
  connectionString: string | undefined;
  ssl?: { ca: string; rejectUnauthorized: true };
}

/**
 * Config de conexión de node-pg (la usan PrismaService y los seeds).
 *
 * Staging/producción hablan con el Postgres de Supabase por internet: con
 * `DATABASE_SSL_CA` (ruta a la CA raíz de Supabase, api/certs/) la conexión
 * va por TLS y verifica el certificado del servidor. Sin esa variable
 * (desarrollo local, Postgres de Docker) se conecta como siempre.
 *
 * Ojo: el pooler de Supabase acepta conexiones SIN cifrar, así que olvidarse
 * esta variable no da error — por eso los .env.example de los servidores la
 * traen puesta. Y `DATABASE_URL` no puede traer `sslmode`: node-pg lo lee de
 * la URL y pisa la opción `ssl`, y hoy trata `require` como `verify-full`
 * contra las CAs del sistema, que no incluyen la de Supabase.
 */
export function pgConnectionConfig(): PgConnectionConfig {
  const connectionString = process.env['DATABASE_URL'];
  const caPath = process.env['DATABASE_SSL_CA'];
  if (!caPath) {
    return { connectionString };
  }
  if (connectionString && hasSslMode(connectionString)) {
    throw new Error(
      'DATABASE_URL no puede traer sslmode si DATABASE_SSL_CA está definida: node-pg usaría el sslmode de la URL e ignoraría la CA',
    );
  }
  return {
    connectionString,
    ssl: { ca: readFileSync(caPath, 'utf8'), rejectUnauthorized: true },
  };
}

function hasSslMode(connectionString: string): boolean {
  try {
    return new URL(connectionString).searchParams.has('sslmode');
  } catch {
    return /[?&]sslmode=/.test(connectionString);
  }
}
