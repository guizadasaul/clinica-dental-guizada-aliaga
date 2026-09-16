-- CLI-62: generaliza patient_invites para poder invitar a cualquier user, no
-- solo pacientes. Aditiva + backfill, una sola transacción (a diferencia de
-- CLI-67, acá no hay un valor de enum nuevo en juego, así que no hace falta
-- partirla en dos migraciones).
--
-- Nota: el FK nuevo usa ON UPDATE CASCADE (no NO ACTION) para quedar
-- consistente con el FK preexistente patient_invites_patient_id_fkey (mismo
-- ON UPDATE CASCADE, ver 20260813_patient_invites/migration.sql) y con lo que
-- el propio `prisma migrate diff` genera a partir del schema (que no declara
-- onUpdate explícito en la relación patient_invites.users, por lo que Prisma
-- aplica su default). Usar NO ACTION acá habría dejado el diff sucio.
ALTER TABLE "patient_invites" ADD COLUMN "user_id" UUID;
UPDATE "patient_invites" pi SET "user_id" = p.user_id FROM "patients" p WHERE pi.patient_id = p.id;
ALTER TABLE "patient_invites" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "patient_invites" ALTER COLUMN "patient_id" DROP NOT NULL;
ALTER TABLE "patient_invites" ADD CONSTRAINT "patient_invites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
