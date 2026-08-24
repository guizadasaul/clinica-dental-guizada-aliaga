-- CLI-41: renombra TreatmentScope (6 valores) a TreatmentApplicationType (12
-- valores) -- el scope viejo metía en un solo cajón ("none") siete cosas
-- distintas (consulta, tejidos blandos, frenillo, prótesis, ortodoncia,
-- unidades y cajas), así que el sistema no podía saber qué pedirle al doctor
-- al elegir un tratamiento sobre el odontograma. Agrega treatment_categories
-- (espejo de diagnosis_categories, CLI-40), treatments.code/display_order, y
-- tooth_procedures.quantity para las aplicaciones por unidad/caja. Los datos
-- del catálogo (nombres nuevos, códigos, categorías) los sincroniza el seed
-- (upsert por code) apenas termina esta migración -- acá solo se deja cada
-- fila existente en un estado válido: code/application_type/category_id no
-- nulos, sin renombrar todavía (el seed hace el rename por code).
--
-- Filas que no matchean ningún nombre del catálogo (datos de prueba viejos,
-- todas ya is_active=false en la base real al momento de escribir esto) reciben
-- un code sintético a partir de su propio id, application_type='general' y la
-- categoría 'basicos' como fallback -- nunca se borran (FKs ON DELETE NO
-- ACTION), y deactivateLegacy() del seed las deja inactivas de nuevo la próxima
-- vez que corre, ahora comparando por code en vez de por name.

-- CreateEnum
CREATE TYPE "TreatmentApplicationType" AS ENUM ('general', 'single_tooth', 'multiple_teeth', 'upper_arch', 'lower_arch', 'full_mouth', 'soft_tissue', 'frenulum', 'prosthesis', 'orthodontic', 'unit', 'box');

-- CreateTable
CREATE TABLE "treatment_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "display_order" INTEGER NOT NULL,

    CONSTRAINT "treatment_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "treatment_categories_code_key" ON "treatment_categories"("code");

-- Seed the 8 categories now (not left to the app seed, unlike diagnosis_categories in
-- CLI-40) -- treatments already has rows referenced by FK from other tables, so
-- category_id has to be non-null by the end of this migration, not populated later.
INSERT INTO "treatment_categories" ("code", "name", "display_order") VALUES
    ('basicos', 'Básicos', 0),
    ('operatoria_dental', 'Operatoria dental', 1),
    ('periodoncia', 'Periodoncia', 2),
    ('endodoncia', 'Endodoncia', 3),
    ('cirugia_oral', 'Cirugía oral', 4),
    ('protesis_removible', 'Prótesis removible', 5),
    ('protesis_fija', 'Prótesis fija', 6),
    ('ortodoncia', 'Ortodoncia', 7);

-- AlterTable: add the new columns nullable first, backfill, then tighten.
ALTER TABLE "treatments" ADD COLUMN     "code" VARCHAR(50),
ADD COLUMN     "application_type" "TreatmentApplicationType",
ADD COLUMN     "category_id" UUID,
ADD COLUMN     "display_order" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "tooth_procedures" ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1;

-- Backfill code / application_type / category_id keyed on each row's CURRENT
-- name (pre-rename -- the seed renames afterwards, matched by code). Rows whose
-- name isn't in the catalog (legacy test data) fall back to a synthetic code,
-- 'general' and the 'basicos' category instead of blocking the migration.
UPDATE "treatments" SET
  "code" = COALESCE(
    CASE "name"
      WHEN 'Consulta' THEN 'consulta_odontologica'
      WHEN 'Emergencia' THEN 'emergencia_odontologica'
      WHEN 'Certificado odontológico' THEN 'certificado_odontologico'
      WHEN 'Caries simple' THEN 'restauracion_caries_simple'
      WHEN 'Caries compuesta' THEN 'restauracion_caries_compuesta'
      WHEN 'Resina para muñón' THEN 'resina_para_munon'
      WHEN 'Ionómero' THEN 'restauracion_ionomero'
      WHEN 'Resina en diente temporal' THEN 'resina_diente_temporal'
      WHEN 'Sellante en diente permanente' THEN 'sellante_diente_permanente'
      WHEN 'Sellante en diente temporal' THEN 'sellante_diente_temporal'
      WHEN 'Blanqueamiento dental láser' THEN 'blanqueamiento_dental_laser'
      WHEN 'Limpieza, profilaxis y flúor' THEN 'limpieza_profilaxis_fluor'
      WHEN 'Gingivectomía superior' THEN 'gingivectomia_superior'
      WHEN 'Gingivectomía inferior' THEN 'gingivectomia_inferior'
      WHEN 'Gingivectomía completa' THEN 'gingivectomia_completa'
      WHEN 'Curetaje' THEN 'curetaje_periodontal'
      WHEN 'Gingivoplastia' THEN 'gingivoplastia'
      WHEN 'Destartraje, limpieza, profilaxis y flúor' THEN 'destartraje_limpieza_profilaxis_fluor'
      WHEN 'Tratamiento de conducto unirradicular' THEN 'conducto_unirradicular'
      WHEN 'Tratamiento de conducto birradicular' THEN 'conducto_birradicular'
      WHEN 'Tratamiento de conducto multirradicular' THEN 'conducto_multirradicular'
      WHEN 'Retratamiento de conducto' THEN 'retratamiento_conducto'
      WHEN 'Extracción simple' THEN 'extraccion_simple'
      WHEN 'Extracción quirúrgica' THEN 'extraccion_quirurgica'
      WHEN 'Extracción de tercer molar' THEN 'extraccion_tercer_molar'
      WHEN 'Operculectomía' THEN 'operculectomia'
      WHEN 'Apicectomía' THEN 'apicectomia'
      WHEN 'Implante' THEN 'implante_dental'
      WHEN 'Cirugía de lesiones en tejidos blandos' THEN 'cirugia_lesiones_tejidos_blandos'
      WHEN 'Frenectomía' THEN 'frenectomia'
      WHEN 'Placa parcial de cromo-cobalto' THEN 'placa_parcial_cromo_cobalto'
      WHEN 'Placa parcial de acrílico' THEN 'placa_parcial_acrilico'
      WHEN 'Placa total de acrílico superior' THEN 'placa_total_acrilico_superior'
      WHEN 'Placa total de acrílico inferior' THEN 'placa_total_acrilico_inferior'
      WHEN 'Placa total de acrílico completa Bonwill' THEN 'placa_total_acrilico_bonwill'
      WHEN 'Placa parcial flexible' THEN 'placa_parcial_flexible'
      WHEN 'Placa parcial Cromoflex' THEN 'placa_parcial_cromoflex'
      WHEN 'Reparación de prótesis' THEN 'reparacion_protesis'
      WHEN 'Rebasado total en laboratorio' THEN 'rebasado_total_laboratorio'
      WHEN 'Rebasado en clínica' THEN 'rebasado_en_clinica'
      WHEN 'Placa de miorelajación' THEN 'placa_miorelajacion'
      WHEN 'Protector bucal' THEN 'protector_bucal'
      WHEN 'Corona provisional' THEN 'corona_provisional'
      WHEN 'Perno de fibra de vidrio' THEN 'perno_fibra_vidrio'
      WHEN 'Perno + muñón' THEN 'perno_y_munon'
      WHEN 'Corona metálica' THEN 'corona_metalica'
      WHEN 'Corona de Ivocron' THEN 'corona_ivocron'
      WHEN 'Corona de Isosit' THEN 'corona_isosit'
      WHEN 'Corona de porcelana sobre metal o plástico' THEN 'corona_porcelana_metal_plastico'
      WHEN 'Corona de porcelana libre de metal' THEN 'corona_porcelana_libre_metal'
      WHEN 'Ortodoncia con brackets metálicos' THEN 'ortodoncia_brackets_metalicos'
      WHEN 'Reposición de bracket metálico' THEN 'reposicion_bracket_metalico'
      WHEN 'Reposición de bandas' THEN 'reposicion_bandas'
      WHEN 'Reposición de arco' THEN 'reposicion_arco'
      WHEN 'Ortodoncia con brackets estéticos' THEN 'ortodoncia_brackets_esteticos'
      WHEN 'Reposición de bracket estético' THEN 'reposicion_bracket_estetico'
      WHEN 'Placa de expansión removible' THEN 'placa_expansion_removible'
      WHEN 'Placa de expansión fija' THEN 'placa_expansion_fija'
      WHEN 'Placa de contención superior' THEN 'placa_contencion_superior'
      WHEN 'Placa de contención inferior' THEN 'placa_contencion_inferior'
      WHEN 'Placa de contención completa' THEN 'placa_contencion_completa'
      WHEN 'Máscara facial' THEN 'mascara_facial'
      WHEN 'Elásticos de clase' THEN 'elasticos_de_clase'
      WHEN 'Cera ortodóntica' THEN 'cera_ortodontica'
    END,
    'legacy_' || replace("id"::text, '-', '')
  ),
  "application_type" = COALESCE(
    CASE "name"
      WHEN 'Consulta' THEN 'general'::"TreatmentApplicationType"
      WHEN 'Emergencia' THEN 'general'::"TreatmentApplicationType"
      WHEN 'Certificado odontológico' THEN 'general'::"TreatmentApplicationType"
      WHEN 'Caries simple' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Caries compuesta' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Resina para muñón' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Ionómero' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Resina en diente temporal' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Sellante en diente permanente' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Sellante en diente temporal' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Blanqueamiento dental láser' THEN 'full_mouth'::"TreatmentApplicationType"
      WHEN 'Limpieza, profilaxis y flúor' THEN 'full_mouth'::"TreatmentApplicationType"
      WHEN 'Gingivectomía superior' THEN 'upper_arch'::"TreatmentApplicationType"
      WHEN 'Gingivectomía inferior' THEN 'lower_arch'::"TreatmentApplicationType"
      WHEN 'Gingivectomía completa' THEN 'full_mouth'::"TreatmentApplicationType"
      WHEN 'Curetaje' THEN 'multiple_teeth'::"TreatmentApplicationType"
      WHEN 'Gingivoplastia' THEN 'multiple_teeth'::"TreatmentApplicationType"
      WHEN 'Destartraje, limpieza, profilaxis y flúor' THEN 'full_mouth'::"TreatmentApplicationType"
      WHEN 'Tratamiento de conducto unirradicular' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Tratamiento de conducto birradicular' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Tratamiento de conducto multirradicular' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Retratamiento de conducto' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Extracción simple' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Extracción quirúrgica' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Extracción de tercer molar' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Operculectomía' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Apicectomía' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Implante' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Cirugía de lesiones en tejidos blandos' THEN 'soft_tissue'::"TreatmentApplicationType"
      WHEN 'Frenectomía' THEN 'frenulum'::"TreatmentApplicationType"
      WHEN 'Placa parcial de cromo-cobalto' THEN 'multiple_teeth'::"TreatmentApplicationType"
      WHEN 'Placa parcial de acrílico' THEN 'multiple_teeth'::"TreatmentApplicationType"
      WHEN 'Placa total de acrílico superior' THEN 'upper_arch'::"TreatmentApplicationType"
      WHEN 'Placa total de acrílico inferior' THEN 'lower_arch'::"TreatmentApplicationType"
      WHEN 'Placa total de acrílico completa Bonwill' THEN 'full_mouth'::"TreatmentApplicationType"
      WHEN 'Placa parcial flexible' THEN 'multiple_teeth'::"TreatmentApplicationType"
      WHEN 'Placa parcial Cromoflex' THEN 'multiple_teeth'::"TreatmentApplicationType"
      WHEN 'Reparación de prótesis' THEN 'prosthesis'::"TreatmentApplicationType"
      WHEN 'Rebasado total en laboratorio' THEN 'prosthesis'::"TreatmentApplicationType"
      WHEN 'Rebasado en clínica' THEN 'prosthesis'::"TreatmentApplicationType"
      WHEN 'Placa de miorelajación' THEN 'upper_arch'::"TreatmentApplicationType"
      WHEN 'Protector bucal' THEN 'upper_arch'::"TreatmentApplicationType"
      WHEN 'Corona provisional' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Perno de fibra de vidrio' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Perno + muñón' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Corona metálica' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Corona de Ivocron' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Corona de Isosit' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Corona de porcelana sobre metal o plástico' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Corona de porcelana libre de metal' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Ortodoncia con brackets metálicos' THEN 'full_mouth'::"TreatmentApplicationType"
      WHEN 'Reposición de bracket metálico' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Reposición de bandas' THEN 'orthodontic'::"TreatmentApplicationType"
      WHEN 'Reposición de arco' THEN 'orthodontic'::"TreatmentApplicationType"
      WHEN 'Ortodoncia con brackets estéticos' THEN 'full_mouth'::"TreatmentApplicationType"
      WHEN 'Reposición de bracket estético' THEN 'single_tooth'::"TreatmentApplicationType"
      WHEN 'Placa de expansión removible' THEN 'orthodontic'::"TreatmentApplicationType"
      WHEN 'Placa de expansión fija' THEN 'orthodontic'::"TreatmentApplicationType"
      WHEN 'Placa de contención superior' THEN 'upper_arch'::"TreatmentApplicationType"
      WHEN 'Placa de contención inferior' THEN 'lower_arch'::"TreatmentApplicationType"
      WHEN 'Placa de contención completa' THEN 'full_mouth'::"TreatmentApplicationType"
      WHEN 'Máscara facial' THEN 'orthodontic'::"TreatmentApplicationType"
      WHEN 'Elásticos de clase' THEN 'unit'::"TreatmentApplicationType"
      WHEN 'Cera ortodóntica' THEN 'box'::"TreatmentApplicationType"
    END,
    'general'::"TreatmentApplicationType"
  ),
  "category_id" = COALESCE(
    (SELECT "id" FROM "treatment_categories" WHERE "code" = CASE "name"
      WHEN 'Consulta' THEN 'basicos'
      WHEN 'Emergencia' THEN 'basicos'
      WHEN 'Certificado odontológico' THEN 'basicos'
      WHEN 'Caries simple' THEN 'operatoria_dental'
      WHEN 'Caries compuesta' THEN 'operatoria_dental'
      WHEN 'Resina para muñón' THEN 'operatoria_dental'
      WHEN 'Ionómero' THEN 'operatoria_dental'
      WHEN 'Resina en diente temporal' THEN 'operatoria_dental'
      WHEN 'Sellante en diente permanente' THEN 'operatoria_dental'
      WHEN 'Sellante en diente temporal' THEN 'operatoria_dental'
      WHEN 'Blanqueamiento dental láser' THEN 'operatoria_dental'
      WHEN 'Limpieza, profilaxis y flúor' THEN 'periodoncia'
      WHEN 'Gingivectomía superior' THEN 'periodoncia'
      WHEN 'Gingivectomía inferior' THEN 'periodoncia'
      WHEN 'Gingivectomía completa' THEN 'periodoncia'
      WHEN 'Curetaje' THEN 'periodoncia'
      WHEN 'Gingivoplastia' THEN 'periodoncia'
      WHEN 'Destartraje, limpieza, profilaxis y flúor' THEN 'periodoncia'
      WHEN 'Tratamiento de conducto unirradicular' THEN 'endodoncia'
      WHEN 'Tratamiento de conducto birradicular' THEN 'endodoncia'
      WHEN 'Tratamiento de conducto multirradicular' THEN 'endodoncia'
      WHEN 'Retratamiento de conducto' THEN 'endodoncia'
      WHEN 'Extracción simple' THEN 'cirugia_oral'
      WHEN 'Extracción quirúrgica' THEN 'cirugia_oral'
      WHEN 'Extracción de tercer molar' THEN 'cirugia_oral'
      WHEN 'Operculectomía' THEN 'cirugia_oral'
      WHEN 'Apicectomía' THEN 'cirugia_oral'
      WHEN 'Implante' THEN 'cirugia_oral'
      WHEN 'Cirugía de lesiones en tejidos blandos' THEN 'cirugia_oral'
      WHEN 'Frenectomía' THEN 'cirugia_oral'
      WHEN 'Placa parcial de cromo-cobalto' THEN 'protesis_removible'
      WHEN 'Placa parcial de acrílico' THEN 'protesis_removible'
      WHEN 'Placa total de acrílico superior' THEN 'protesis_removible'
      WHEN 'Placa total de acrílico inferior' THEN 'protesis_removible'
      WHEN 'Placa total de acrílico completa Bonwill' THEN 'protesis_removible'
      WHEN 'Placa parcial flexible' THEN 'protesis_removible'
      WHEN 'Placa parcial Cromoflex' THEN 'protesis_removible'
      WHEN 'Reparación de prótesis' THEN 'protesis_removible'
      WHEN 'Rebasado total en laboratorio' THEN 'protesis_removible'
      WHEN 'Rebasado en clínica' THEN 'protesis_removible'
      WHEN 'Placa de miorelajación' THEN 'protesis_removible'
      WHEN 'Protector bucal' THEN 'protesis_removible'
      WHEN 'Corona provisional' THEN 'protesis_fija'
      WHEN 'Perno de fibra de vidrio' THEN 'protesis_fija'
      WHEN 'Perno + muñón' THEN 'protesis_fija'
      WHEN 'Corona metálica' THEN 'protesis_fija'
      WHEN 'Corona de Ivocron' THEN 'protesis_fija'
      WHEN 'Corona de Isosit' THEN 'protesis_fija'
      WHEN 'Corona de porcelana sobre metal o plástico' THEN 'protesis_fija'
      WHEN 'Corona de porcelana libre de metal' THEN 'protesis_fija'
      WHEN 'Ortodoncia con brackets metálicos' THEN 'ortodoncia'
      WHEN 'Reposición de bracket metálico' THEN 'ortodoncia'
      WHEN 'Reposición de bandas' THEN 'ortodoncia'
      WHEN 'Reposición de arco' THEN 'ortodoncia'
      WHEN 'Ortodoncia con brackets estéticos' THEN 'ortodoncia'
      WHEN 'Reposición de bracket estético' THEN 'ortodoncia'
      WHEN 'Placa de expansión removible' THEN 'ortodoncia'
      WHEN 'Placa de expansión fija' THEN 'ortodoncia'
      WHEN 'Placa de contención superior' THEN 'ortodoncia'
      WHEN 'Placa de contención inferior' THEN 'ortodoncia'
      WHEN 'Placa de contención completa' THEN 'ortodoncia'
      WHEN 'Máscara facial' THEN 'ortodoncia'
      WHEN 'Elásticos de clase' THEN 'ortodoncia'
      WHEN 'Cera ortodóntica' THEN 'ortodoncia'
    END),
    (SELECT "id" FROM "treatment_categories" WHERE "code" = 'basicos')
  );

-- Sanity check — con los fallbacks de arriba esto nunca debería dispararse,
-- pero deja evidencia clara si alguna fila igual quedó sin completar.
DO $$
DECLARE unmatched integer;
BEGIN
  SELECT count(*) INTO unmatched FROM "treatments" WHERE "code" IS NULL OR "application_type" IS NULL OR "category_id" IS NULL;
  IF unmatched > 0 THEN
    RAISE EXCEPTION 'CLI-41 backfill left % treatments row(s) without code/application_type/category_id despite the fallback -- investigate', unmatched;
  END IF;
END $$;

-- Drop the old enum column and tighten the new ones.
ALTER TABLE "treatments" DROP COLUMN "scope";
DROP TYPE "TreatmentScope";

ALTER TABLE "treatments" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "treatments" ALTER COLUMN "application_type" SET NOT NULL,
ALTER COLUMN "application_type" SET DEFAULT 'single_tooth';
ALTER TABLE "treatments" ALTER COLUMN "category_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "treatments_code_key" ON "treatments"("code");

-- AddForeignKey
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "treatment_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
