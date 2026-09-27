-- CLI-159: RLS en la tabla nueva, como toda tabla de `public` (ver
-- 20260925000000_enable_rls_all_public_tables): en Supabase la Data API
-- publica `public` y la key publicable viaja en el frontend. Sin policies:
-- solo el backend (dueño de la tabla) la lee y escribe.
ALTER TABLE "quote_qr_charges" ENABLE ROW LEVEL SECURITY;
