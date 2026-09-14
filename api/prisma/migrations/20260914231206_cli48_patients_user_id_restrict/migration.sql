-- CLI-48: patients.user_id es NOT NULL, así que ON DELETE SET NULL nunca se
-- podía cumplir (Postgres no puede poner NULL en una columna que no lo
-- admite) — borrar un usuario con ficha asociada fallaba con un error de FK
-- en vez de comportarse como el schema declaraba. Se cambia a RESTRICT, que
-- sí es alcanzable con la nulabilidad real de la columna.
ALTER TABLE "patients" DROP CONSTRAINT "patients_user_id_fkey";
ALTER TABLE "patients" ADD CONSTRAINT "patients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
