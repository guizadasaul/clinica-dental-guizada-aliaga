import { Client } from 'pg';

// Toda tabla de `public` tiene que tener RLS activo (migración
// 20260925000000_enable_rls_all_public_tables): en Supabase, `public` se
// publica por la Data API y la key publicable viaja en el frontend. Si una
// migración nueva crea una tabla sin su `ALTER TABLE ... ENABLE ROW LEVEL
// SECURITY`, este spec falla en CI antes de que la tabla llegue a staging.
describe('Row Level Security (e2e)', () => {
  const client = new Client({ connectionString: process.env['DATABASE_URL'] });

  beforeAll(() => client.connect());
  afterAll(() => client.end());

  it('todas las tablas de public tienen RLS activo', async () => {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public' AND NOT rowsecurity
       ORDER BY tablename`,
    );

    expect(rows.map((row) => row.tablename)).toEqual([]);
  });
});
