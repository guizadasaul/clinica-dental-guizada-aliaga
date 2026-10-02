-- CLI-143: el teléfono puede no quedar habilitado como login en Supabase Auth
-- (por ejemplo, porque ya pertenece a otra cuenta). Se guarda el motivo para
-- que el doctor o el admin lo vean en la ficha, y no solo en los logs.
ALTER TABLE "users" ADD COLUMN "phone_login_error" VARCHAR(20);

ALTER TABLE "users"
  ADD CONSTRAINT "users_phone_login_error_check"
  CHECK ("phone_login_error" IN ('phone_in_use', 'unknown'));
