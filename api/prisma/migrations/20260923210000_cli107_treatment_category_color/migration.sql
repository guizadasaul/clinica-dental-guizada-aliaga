-- CLI-107: color por categoría de tratamiento, para pintar en el odontograma
-- de tratamientos los dientes ya tratados. Aditiva: se agrega nullable, se
-- completa por code con la misma paleta que carga el seed y recién después
-- pasa a NOT NULL. Cualquier categoría fuera del catálogo conocido queda en
-- gris pizarra en vez de romper la migración.
-- AlterTable
ALTER TABLE "treatment_categories" ADD COLUMN "color" VARCHAR(7);

UPDATE "treatment_categories" SET "color" = CASE "code"
  WHEN 'basicos' THEN '#334155'
  WHEN 'operatoria_dental' THEN '#16a34a'
  WHEN 'periodoncia' THEN '#65a30d'
  WHEN 'endodoncia' THEN '#a21caf'
  WHEN 'cirugia_oral' THEN '#9f1239'
  WHEN 'protesis_removible' THEN '#4338ca'
  WHEN 'protesis_fija' THEN '#0369a1'
  WHEN 'ortodoncia' THEN '#854d0e'
  ELSE '#334155'
END;

ALTER TABLE "treatment_categories" ALTER COLUMN "color" SET NOT NULL;
