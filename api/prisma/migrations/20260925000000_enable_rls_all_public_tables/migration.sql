-- RLS en todas las tablas de `public`, sin policies.
--
-- En Supabase, el schema `public` se publica por la Data API (PostgREST) y el
-- frontend lleva la key publicable: sin RLS, cualquiera con esa key podría
-- leer y escribir cualquier tabla salteándose el backend. Con RLS activo y
-- sin policies, los roles `anon` y `authenticated` no ven ninguna fila.
--
-- El backend no se ve afectado: Prisma se conecta como el dueño de las
-- tablas (`postgres`), y el dueño saltea RLS salvo que se use FORCE ROW LEVEL
-- SECURITY, que acá no se usa. En el Postgres local de desarrollo pasa lo
-- mismo.
--
-- Es la segunda barrera: la primera es tener la Data API desactivada (o sin
-- `public` en los schemas expuestos) en cada proyecto de Supabase. Toda tabla
-- nueva necesita su propio ALTER TABLE ... ENABLE ROW LEVEL SECURITY en su
-- migración — lo verifica test/rls.e2e-spec.ts contra la base migrada.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END
$$;
