-- CLI-76: nombre y apellidos reales del doctor, separados (como en pacientes).
-- Aditiva y nullable a propósito: los doctores cargados antes de esta issue no
-- tienen estos datos y no se puede reconstruir un split confiable a partir de
-- users.display_name ("Dra. Marylu Aliaga Calle"), así que no hay backfill.
-- users.display_name sigue siendo el nombre público que ve el paciente.
-- AlterTable
ALTER TABLE "doctor_profiles" ADD COLUMN     "first_name" VARCHAR(100),
ADD COLUMN     "last_name_maternal" VARCHAR(100),
ADD COLUMN     "last_name_paternal" VARCHAR(100);
