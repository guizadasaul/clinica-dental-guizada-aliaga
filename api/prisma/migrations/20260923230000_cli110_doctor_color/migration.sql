-- CLI-110: color de cada doctor en la agenda común. Aditiva: se agrega con
-- default y después se reparte la paleta (la misma de
-- src/shared/doctor-color-palette.ts) entre los doctores existentes según
-- display_order, para que nadie arranque con el mismo color.
-- AlterTable
ALTER TABLE "doctor_profiles" ADD COLUMN     "color" VARCHAR(7) NOT NULL DEFAULT '#2563eb';

UPDATE "doctor_profiles" AS dp
SET "color" = (ARRAY['#2563eb', '#db2777', '#16a34a', '#ea580c', '#7c3aed', '#0891b2', '#ca8a04', '#dc2626'])[((ranked.rn - 1) % 8) + 1]
FROM (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "display_order", "created_at") AS rn
  FROM "doctor_profiles"
) AS ranked
WHERE dp."id" = ranked."id";
