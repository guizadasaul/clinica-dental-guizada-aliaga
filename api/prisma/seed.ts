import { PrismaClient } from '@prisma/client';
import type { TreatmentApplicationType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { pgConnectionConfig } from '../src/shared/prisma/pg-connection';

const adapter = new PrismaPg(pgConnectionConfig());
const prisma = new PrismaClient({ adapter });

interface SeedTreatmentCategory {
  code: string;
  name: string;
  /** Color con el que se pinta en el odontograma un diente tratado (CLI-107). */
  color: string;
}

interface SeedTreatment {
  code: string;
  name: string;
  categoryCode: string;
  basePrice: number;
  applicationType: TreatmentApplicationType;
  currency: 'BOB' | 'USD';
}

/**
 * Catálogo real de la clínica (64 tratamientos, CLI-18) en 8 categorías
 * (CLI-41). Todo en BOB salvo Implante dental (USD). El `code` es la clave
 * estable del upsert — permite renombrar un tratamiento sin duplicar la fila
 * ni desactivarla por accidente (ver deactivateLegacy más abajo, que ahora
 * compara por code).
 */
const TREATMENT_CATEGORIES: SeedTreatmentCategory[] = [
  { code: 'basicos', name: 'Básicos', color: '#334155' },
  { code: 'operatoria_dental', name: 'Operatoria dental', color: '#16a34a' },
  { code: 'periodoncia', name: 'Periodoncia', color: '#0f766e' },
  { code: 'endodoncia', name: 'Endodoncia', color: '#a21caf' },
  { code: 'cirugia_oral', name: 'Cirugía oral', color: '#9f1239' },
  { code: 'protesis_removible', name: 'Prótesis removible', color: '#4338ca' },
  { code: 'protesis_fija', name: 'Prótesis fija', color: '#0369a1' },
  { code: 'ortodoncia', name: 'Ortodoncia', color: '#854d0e' },
];

const CATALOG: SeedTreatment[] = [
  // Básicos
  {
    code: 'consulta_odontologica',
    name: 'Consulta odontológica',
    categoryCode: 'basicos',
    basePrice: 50,
    applicationType: 'general',
    currency: 'BOB',
  },
  {
    code: 'emergencia_odontologica',
    name: 'Emergencia odontológica',
    categoryCode: 'basicos',
    basePrice: 100,
    applicationType: 'general',
    currency: 'BOB',
  },
  {
    code: 'certificado_odontologico',
    name: 'Certificado odontológico',
    categoryCode: 'basicos',
    basePrice: 150,
    applicationType: 'general',
    currency: 'BOB',
  },
  // Operatoria dental
  {
    code: 'restauracion_caries_simple',
    name: 'Restauración de caries simple',
    categoryCode: 'operatoria_dental',
    basePrice: 180,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  {
    code: 'restauracion_caries_compuesta',
    name: 'Restauración de caries compuesta',
    categoryCode: 'operatoria_dental',
    basePrice: 250,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  {
    code: 'resina_para_munon',
    name: 'Resina para muñón',
    categoryCode: 'operatoria_dental',
    basePrice: 80,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  {
    code: 'restauracion_ionomero',
    name: 'Restauración con ionómero',
    categoryCode: 'operatoria_dental',
    basePrice: 80,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  {
    code: 'resina_diente_temporal',
    name: 'Resina en diente temporal',
    categoryCode: 'operatoria_dental',
    basePrice: 80,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  {
    code: 'sellante_diente_permanente',
    name: 'Sellante en diente permanente',
    categoryCode: 'operatoria_dental',
    basePrice: 100,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  {
    code: 'sellante_diente_temporal',
    name: 'Sellante en diente temporal',
    categoryCode: 'operatoria_dental',
    basePrice: 80,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  {
    code: 'blanqueamiento_dental_laser',
    name: 'Blanqueamiento dental láser',
    categoryCode: 'operatoria_dental',
    basePrice: 1000,
    applicationType: 'full_mouth',
    currency: 'BOB',
  },
  // Periodoncia
  {
    code: 'limpieza_profilaxis_fluor',
    name: 'Limpieza, profilaxis y flúor',
    categoryCode: 'periodoncia',
    basePrice: 250,
    applicationType: 'full_mouth',
    currency: 'BOB',
  },
  {
    code: 'gingivectomia_superior',
    name: 'Gingivectomía superior',
    categoryCode: 'periodoncia',
    basePrice: 400,
    applicationType: 'upper_arch',
    currency: 'BOB',
  },
  {
    code: 'gingivectomia_inferior',
    name: 'Gingivectomía inferior',
    categoryCode: 'periodoncia',
    basePrice: 400,
    applicationType: 'lower_arch',
    currency: 'BOB',
  },
  {
    code: 'gingivectomia_completa',
    name: 'Gingivectomía completa',
    categoryCode: 'periodoncia',
    basePrice: 800,
    applicationType: 'full_mouth',
    currency: 'BOB',
  },
  {
    code: 'curetaje_periodontal',
    name: 'Curetaje periodontal',
    categoryCode: 'periodoncia',
    basePrice: 150,
    applicationType: 'multiple_teeth',
    currency: 'BOB',
  },
  {
    code: 'gingivoplastia',
    name: 'Gingivoplastia',
    categoryCode: 'periodoncia',
    basePrice: 200,
    applicationType: 'multiple_teeth',
    currency: 'BOB',
  },
  {
    code: 'destartraje_limpieza_profilaxis_fluor',
    name: 'Destartraje, limpieza, profilaxis y flúor',
    categoryCode: 'periodoncia',
    basePrice: 350,
    applicationType: 'full_mouth',
    currency: 'BOB',
  },
  // Endodoncia
  {
    code: 'conducto_unirradicular',
    name: 'Tratamiento de conducto unirradicular',
    categoryCode: 'endodoncia',
    basePrice: 300,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  {
    code: 'conducto_birradicular',
    name: 'Tratamiento de conducto birradicular',
    categoryCode: 'endodoncia',
    basePrice: 350,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  {
    code: 'conducto_multirradicular',
    name: 'Tratamiento de conducto multirradicular',
    categoryCode: 'endodoncia',
    basePrice: 450,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  {
    code: 'retratamiento_conducto',
    name: 'Retratamiento de conducto',
    categoryCode: 'endodoncia',
    basePrice: 400,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  // Cirugía oral
  {
    code: 'extraccion_simple',
    name: 'Extracción simple',
    categoryCode: 'cirugia_oral',
    basePrice: 100,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  {
    code: 'extraccion_quirurgica',
    name: 'Extracción quirúrgica',
    categoryCode: 'cirugia_oral',
    basePrice: 500,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  {
    code: 'extraccion_tercer_molar',
    name: 'Extracción de tercer molar',
    categoryCode: 'cirugia_oral',
    basePrice: 600,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  {
    code: 'operculectomia',
    name: 'Operculectomía',
    categoryCode: 'cirugia_oral',
    basePrice: 200,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  {
    code: 'apicectomia',
    name: 'Apicectomía',
    categoryCode: 'cirugia_oral',
    basePrice: 450,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  {
    code: 'implante_dental',
    name: 'Implante dental',
    categoryCode: 'cirugia_oral',
    basePrice: 700,
    applicationType: 'single_tooth',
    currency: 'USD',
  },
  {
    code: 'cirugia_lesiones_tejidos_blandos',
    name: 'Cirugía de lesiones en tejidos blandos',
    categoryCode: 'cirugia_oral',
    basePrice: 500,
    applicationType: 'soft_tissue',
    currency: 'BOB',
  },
  {
    code: 'frenectomia',
    name: 'Frenectomía',
    categoryCode: 'cirugia_oral',
    basePrice: 800,
    applicationType: 'frenulum',
    currency: 'BOB',
  },
  // Prótesis removible
  {
    code: 'placa_parcial_cromo_cobalto',
    name: 'Placa parcial de cromo-cobalto',
    categoryCode: 'protesis_removible',
    basePrice: 1400,
    applicationType: 'multiple_teeth',
    currency: 'BOB',
  },
  {
    code: 'placa_parcial_acrilico',
    name: 'Placa parcial de acrílico',
    categoryCode: 'protesis_removible',
    basePrice: 1000,
    applicationType: 'multiple_teeth',
    currency: 'BOB',
  },
  {
    code: 'placa_total_acrilico_superior',
    name: 'Placa total de acrílico superior',
    categoryCode: 'protesis_removible',
    basePrice: 1500,
    applicationType: 'upper_arch',
    currency: 'BOB',
  },
  {
    code: 'placa_total_acrilico_inferior',
    name: 'Placa total de acrílico inferior',
    categoryCode: 'protesis_removible',
    basePrice: 1500,
    applicationType: 'lower_arch',
    currency: 'BOB',
  },
  {
    code: 'placa_total_acrilico_bonwill',
    name: 'Placa total de acrílico completa Bonwill',
    categoryCode: 'protesis_removible',
    basePrice: 2500,
    applicationType: 'full_mouth',
    currency: 'BOB',
  },
  {
    code: 'placa_parcial_flexible',
    name: 'Placa parcial flexible',
    categoryCode: 'protesis_removible',
    basePrice: 1500,
    applicationType: 'multiple_teeth',
    currency: 'BOB',
  },
  {
    code: 'placa_parcial_cromoflex',
    name: 'Placa parcial Cromoflex',
    categoryCode: 'protesis_removible',
    basePrice: 1700,
    applicationType: 'multiple_teeth',
    currency: 'BOB',
  },
  {
    code: 'reparacion_protesis',
    name: 'Reparación de prótesis',
    categoryCode: 'protesis_removible',
    basePrice: 300,
    applicationType: 'prosthesis',
    currency: 'BOB',
  },
  {
    code: 'rebasado_total_laboratorio',
    name: 'Rebasado total en laboratorio',
    categoryCode: 'protesis_removible',
    basePrice: 400,
    applicationType: 'prosthesis',
    currency: 'BOB',
  },
  {
    code: 'rebasado_en_clinica',
    name: 'Rebasado en clínica',
    categoryCode: 'protesis_removible',
    basePrice: 200,
    applicationType: 'prosthesis',
    currency: 'BOB',
  },
  {
    code: 'placa_miorelajacion',
    name: 'Placa de miorelajación',
    categoryCode: 'protesis_removible',
    basePrice: 350,
    applicationType: 'upper_arch',
    currency: 'BOB',
  },
  {
    code: 'protector_bucal',
    name: 'Protector bucal',
    categoryCode: 'protesis_removible',
    basePrice: 700,
    applicationType: 'upper_arch',
    currency: 'BOB',
  },
  // Prótesis fija
  {
    code: 'corona_provisional',
    name: 'Corona provisional',
    categoryCode: 'protesis_fija',
    basePrice: 100,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  {
    code: 'perno_fibra_vidrio',
    name: 'Perno de fibra de vidrio',
    categoryCode: 'protesis_fija',
    basePrice: 350,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  {
    code: 'perno_y_munon',
    name: 'Perno y muñón',
    categoryCode: 'protesis_fija',
    basePrice: 250,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  {
    code: 'corona_metalica',
    name: 'Corona metálica',
    categoryCode: 'protesis_fija',
    basePrice: 350,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  {
    code: 'corona_ivocron',
    name: 'Corona de Ivocron',
    categoryCode: 'protesis_fija',
    basePrice: 550,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  {
    code: 'corona_isosit',
    name: 'Corona de Isosit',
    categoryCode: 'protesis_fija',
    basePrice: 750,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  {
    code: 'corona_porcelana_metal_plastico',
    name: 'Corona de porcelana sobre metal o plástico',
    categoryCode: 'protesis_fija',
    basePrice: 950,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  {
    code: 'corona_porcelana_libre_metal',
    name: 'Corona de porcelana libre de metal',
    categoryCode: 'protesis_fija',
    basePrice: 1200,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  // Ortodoncia
  {
    code: 'ortodoncia_brackets_metalicos',
    name: 'Ortodoncia con brackets metálicos',
    categoryCode: 'ortodoncia',
    basePrice: 6800,
    applicationType: 'full_mouth',
    currency: 'BOB',
  },
  {
    code: 'reposicion_bracket_metalico',
    name: 'Reposición de bracket metálico',
    categoryCode: 'ortodoncia',
    basePrice: 150,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  {
    code: 'reposicion_bandas',
    name: 'Reposición de bandas',
    categoryCode: 'ortodoncia',
    basePrice: 150,
    applicationType: 'orthodontic',
    currency: 'BOB',
  },
  {
    code: 'reposicion_arco',
    name: 'Reposición de arco',
    categoryCode: 'ortodoncia',
    basePrice: 50,
    applicationType: 'orthodontic',
    currency: 'BOB',
  },
  {
    code: 'ortodoncia_brackets_esteticos',
    name: 'Ortodoncia con brackets estéticos',
    categoryCode: 'ortodoncia',
    basePrice: 8300,
    applicationType: 'full_mouth',
    currency: 'BOB',
  },
  {
    code: 'reposicion_bracket_estetico',
    name: 'Reposición de bracket estético',
    categoryCode: 'ortodoncia',
    basePrice: 200,
    applicationType: 'single_tooth',
    currency: 'BOB',
  },
  {
    code: 'placa_expansion_removible',
    name: 'Placa de expansión removible',
    categoryCode: 'ortodoncia',
    basePrice: 500,
    applicationType: 'orthodontic',
    currency: 'BOB',
  },
  {
    code: 'placa_expansion_fija',
    name: 'Placa de expansión fija',
    categoryCode: 'ortodoncia',
    basePrice: 1000,
    applicationType: 'orthodontic',
    currency: 'BOB',
  },
  {
    code: 'placa_contencion_superior',
    name: 'Placa de contención superior',
    categoryCode: 'ortodoncia',
    basePrice: 400,
    applicationType: 'upper_arch',
    currency: 'BOB',
  },
  {
    code: 'placa_contencion_inferior',
    name: 'Placa de contención inferior',
    categoryCode: 'ortodoncia',
    basePrice: 400,
    applicationType: 'lower_arch',
    currency: 'BOB',
  },
  {
    code: 'placa_contencion_completa',
    name: 'Placa de contención completa',
    categoryCode: 'ortodoncia',
    basePrice: 800,
    applicationType: 'full_mouth',
    currency: 'BOB',
  },
  {
    code: 'mascara_facial',
    name: 'Máscara facial',
    categoryCode: 'ortodoncia',
    basePrice: 3500,
    applicationType: 'orthodontic',
    currency: 'BOB',
  },
  {
    code: 'elasticos_de_clase',
    name: 'Elásticos de clase',
    categoryCode: 'ortodoncia',
    basePrice: 20,
    applicationType: 'unit',
    currency: 'BOB',
  },
  {
    code: 'cera_ortodontica',
    name: 'Cera ortodóntica',
    categoryCode: 'ortodoncia',
    basePrice: 30,
    applicationType: 'box',
    currency: 'BOB',
  },
];

interface SeedTestimonial {
  id: string;
  name: string;
  treatment: string;
  comment: string;
}

/**
 * Testimonios de prueba para CLI-35 (verificar el carrusel + el botón
 * "Deja un comentario" con más de 3-4 tarjetas). `id` fijo por entrada:
 * así el upsert es idempotente entre reinicios del contenedor, igual que
 * `upsertCatalog` de arriba.
 */
const TEST_TESTIMONIALS: SeedTestimonial[] = [
  {
    id: '3f6a8b1c-1a2d-4e3f-9b7a-1c2d3e4f5a01',
    name: 'Sofía Ramírez',
    treatment: 'Blanqueamiento dental láser',
    comment:
      'Después de años sin animarme a sonreír en las fotos, hice el blanqueamiento láser y no lo podía creer: en una sola sesión noté la diferencia. El equipo me hizo sentir súper cómoda todo el tiempo.',
  },
  {
    id: '3f6a8b1c-1a2d-4e3f-9b7a-1c2d3e4f5a02',
    name: 'Marcelo Quispe',
    treatment: 'Ortodoncia con brackets metálicos',
    comment:
      'Empecé el tratamiento de ortodoncia hace un año y ver el avance mes a mes fue increíble. Siempre me explicaron cada paso con paciencia, nunca me sentí apurado en las consultas.',
  },
  {
    id: '3f6a8b1c-1a2d-4e3f-9b7a-1c2d3e4f5a03',
    name: 'Daniela Fernández',
    treatment: 'Implante',
    comment:
      'Tenía mucho miedo de hacerme un implante, pero el Dr. Ariel y su equipo me acompañaron en todo el proceso. El resultado quedó perfecto, ni se nota que no es mi diente original.',
  },
  {
    id: '3f6a8b1c-1a2d-4e3f-9b7a-1c2d3e4f5a04',
    name: 'Rodrigo Salazar',
    treatment: 'Limpieza, profilaxis y flúor',
    comment:
      'Vengo cada seis meses a mi limpieza y siempre salgo contento. La atención es rápida, puntual y el consultorio está impecable.',
  },
  {
    id: '3f6a8b1c-1a2d-4e3f-9b7a-1c2d3e4f5a05',
    name: 'Valentina Ortiz',
    treatment: 'Corona de porcelana libre de metal',
    comment:
      'Me hice una corona de porcelana y el color quedó idéntico al resto de mis dientes. Se nota la dedicación en cada detalle.',
  },
];

async function upsertTestimonials() {
  for (const t of TEST_TESTIMONIALS) {
    await prisma.testimonials.upsert({
      where: { id: t.id },
      create: {
        id: t.id,
        name: t.name,
        treatment: t.treatment,
        comment: t.comment,
        status: 'approved',
      },
      update: {
        name: t.name,
        treatment: t.treatment,
        comment: t.comment,
        status: 'approved',
      },
    });
  }
  console.log(
    `✓ ${TEST_TESTIMONIALS.length} testimonios de prueba sincronizados.`,
  );
}

interface SeedDiagnosisCategory {
  code: string;
  name: string;
  color: string;
}

interface SeedDiagnosis {
  code: string;
  categoryCode: string;
  name: string;
  scope: 'single_tooth' | 'multiple_teeth' | 'general';
  modifier?: 'black_class' | 'mobility_grade';
}

/**
 * Catálogo real de diagnósticos de la clínica (CLI-40, 10 categorías / 37
 * diagnósticos), reemplaza el catálogo inventado que tenía el paso 5 del
 * wizard. Un diagnóstico se aplica a una sola pieza (`single_tooth`), a
 * varias (`multiple_teeth`) o a ninguna — no cuelga de un diente
 * (`general`, p. ej. lesiones de tejidos blandos). El color es por
 * categoría, no por diagnóstico, para que el chart y la leyenda no exploten
 * en variedad.
 */
const DIAGNOSIS_CATEGORIES: SeedDiagnosisCategory[] = [
  {
    code: 'absence_anomalies',
    name: 'Ausencias y anomalías dentarias',
    color: '#6b7280',
  },
  { code: 'caries', name: 'Caries dentales', color: '#dc2626' },
  {
    code: 'restorations',
    name: 'Restauraciones / obturaciones',
    color: '#2563eb',
  },
  {
    code: 'structural_lesions',
    name: 'Alteraciones estructurales y lesiones dentarias',
    color: '#d97706',
  },
  {
    code: 'endodontic',
    name: 'Tratamientos y condiciones endodónticas',
    color: '#ea580c',
  },
  {
    code: 'position_eruption',
    name: 'Alteraciones de posición y erupción',
    color: '#7c3aed',
  },
  { code: 'periodontal', name: 'Alteraciones periodontales', color: '#0d9488' },
  {
    code: 'soft_tissue',
    name: 'Alteraciones de tejidos blandos',
    color: '#db2777',
  },
  { code: 'prosthesis', name: 'Prótesis', color: '#0891b2' },
  { code: 'symptomatology', name: 'Sintomatología', color: '#ca8a04' },
];

const DIAGNOSES: SeedDiagnosis[] = [
  // 1. Ausencias y anomalías dentarias
  {
    code: 'agenesia_dental',
    categoryCode: 'absence_anomalies',
    name: 'Agenesia dental',
    scope: 'single_tooth',
  },
  {
    code: 'ausencia_dental',
    categoryCode: 'absence_anomalies',
    name: 'Ausencia dental',
    scope: 'multiple_teeth',
  },
  {
    code: 'diente_supernumerario',
    categoryCode: 'absence_anomalies',
    name: 'Diente supernumerario',
    scope: 'general',
  },
  {
    code: 'geminacion_dental',
    categoryCode: 'absence_anomalies',
    name: 'Geminación dental',
    scope: 'single_tooth',
  },

  // 2. Caries dentales
  {
    code: 'caries_primer_grado',
    categoryCode: 'caries',
    name: 'Caries de primer grado',
    scope: 'single_tooth',
    modifier: 'black_class',
  },
  {
    code: 'caries_segundo_grado',
    categoryCode: 'caries',
    name: 'Caries de segundo grado',
    scope: 'single_tooth',
    modifier: 'black_class',
  },
  {
    code: 'caries_tercer_grado',
    categoryCode: 'caries',
    name: 'Caries de tercer grado',
    scope: 'single_tooth',
    modifier: 'black_class',
  },
  {
    code: 'caries_cuarto_grado',
    categoryCode: 'caries',
    name: 'Caries de cuarto grado',
    scope: 'single_tooth',
    modifier: 'black_class',
  },

  // 3. Restauraciones / obturaciones
  {
    code: 'obturacion_resina',
    categoryCode: 'restorations',
    name: 'Obturación con resina',
    scope: 'single_tooth',
    modifier: 'black_class',
  },
  {
    code: 'obturacion_resina_recidivante',
    categoryCode: 'restorations',
    name: 'Obturación con resina recidivante',
    scope: 'single_tooth',
    modifier: 'black_class',
  },
  {
    code: 'obturacion_amalgama',
    categoryCode: 'restorations',
    name: 'Obturación con amalgama',
    scope: 'single_tooth',
    modifier: 'black_class',
  },
  {
    code: 'obturacion_amalgama_recidivante',
    categoryCode: 'restorations',
    name: 'Obturación con amalgama recidivante',
    scope: 'single_tooth',
    modifier: 'black_class',
  },
  {
    code: 'obturacion_provisional',
    categoryCode: 'restorations',
    name: 'Obturación provisional',
    scope: 'single_tooth',
    modifier: 'black_class',
  },

  // 4. Alteraciones estructurales y lesiones dentarias
  {
    code: 'resto_radicular',
    categoryCode: 'structural_lesions',
    name: 'Resto radicular',
    scope: 'single_tooth',
  },
  {
    code: 'fractura_incisal',
    categoryCode: 'structural_lesions',
    name: 'Fractura incisal',
    scope: 'single_tooth',
  },
  {
    code: 'fractura_media',
    categoryCode: 'structural_lesions',
    name: 'Fractura media',
    scope: 'single_tooth',
  },
  {
    code: 'fractura_oclusal',
    categoryCode: 'structural_lesions',
    name: 'Fractura oclusal',
    scope: 'single_tooth',
  },
  {
    code: 'munon_dental',
    categoryCode: 'structural_lesions',
    name: 'Muñón dental',
    scope: 'single_tooth',
  },
  {
    code: 'movilidad_dental',
    categoryCode: 'structural_lesions',
    name: 'Movilidad dental',
    scope: 'single_tooth',
    modifier: 'mobility_grade',
  },

  // 5. Tratamientos y condiciones endodónticas
  {
    code: 'endodoncia',
    categoryCode: 'endodontic',
    name: 'Endodoncia',
    scope: 'single_tooth',
  },
  {
    code: 'endodoncia_pigmentacion',
    categoryCode: 'endodontic',
    name: 'Endodoncia con pigmentación',
    scope: 'single_tooth',
  },
  {
    code: 'endodoncia_fractura',
    categoryCode: 'endodontic',
    name: 'Endodoncia con fractura',
    scope: 'single_tooth',
  },

  // 6. Alteraciones de posición y erupción
  {
    code: 'giroversion_dental',
    categoryCode: 'position_eruption',
    name: 'Giroversión dental',
    scope: 'single_tooth',
  },
  {
    code: 'erupcion_dental',
    categoryCode: 'position_eruption',
    name: 'Erupción dental',
    scope: 'single_tooth',
  },
  {
    code: 'retencion_dental',
    categoryCode: 'position_eruption',
    name: 'Retención dental',
    scope: 'single_tooth',
  },
  {
    code: 'pericoronaritis',
    categoryCode: 'position_eruption',
    name: 'Pericoronaritis',
    scope: 'single_tooth',
  },

  // 7. Alteraciones periodontales
  {
    code: 'gingivitis',
    categoryCode: 'periodontal',
    name: 'Gingivitis',
    scope: 'multiple_teeth',
  },

  // 8. Alteraciones de tejidos blandos (no se asocian a ningún diente)
  {
    code: 'lesion_labio_superior',
    categoryCode: 'soft_tissue',
    name: 'Lesión del labio superior',
    scope: 'general',
  },
  {
    code: 'lesion_labio_inferior',
    categoryCode: 'soft_tissue',
    name: 'Lesión del labio inferior',
    scope: 'general',
  },
  {
    code: 'lesion_mucosa_derecha',
    categoryCode: 'soft_tissue',
    name: 'Lesión de mucosa derecha',
    scope: 'general',
  },
  {
    code: 'lesion_mucosa_izquierda',
    categoryCode: 'soft_tissue',
    name: 'Lesión de mucosa izquierda',
    scope: 'general',
  },
  {
    code: 'lesion_lengua',
    categoryCode: 'soft_tissue',
    name: 'Lesión de lengua',
    scope: 'general',
  },
  {
    code: 'frenillo_lingual_bajo',
    categoryCode: 'soft_tissue',
    name: 'Implantación baja del frenillo lingual',
    scope: 'general',
  },
  {
    code: 'frenillo_labial_superior_bajo',
    categoryCode: 'soft_tissue',
    name: 'Implantación baja del frenillo labial superior',
    scope: 'general',
  },

  // 9. Prótesis
  {
    code: 'protesis_fija',
    categoryCode: 'prosthesis',
    name: 'Prótesis fija',
    scope: 'multiple_teeth',
  },
  {
    code: 'protesis_fija_recidivante',
    categoryCode: 'prosthesis',
    name: 'Prótesis fija recidivante',
    scope: 'multiple_teeth',
  },

  // 10. Sintomatología
  {
    code: 'dolor_dental',
    categoryCode: 'symptomatology',
    name: 'Dolor dental',
    scope: 'single_tooth',
  },
];

async function upsertDiagnosisCatalog() {
  const categoryIdByCode = new Map<string, string>();
  for (const [index, category] of DIAGNOSIS_CATEGORIES.entries()) {
    const row = await prisma.diagnosis_categories.upsert({
      where: { code: category.code },
      create: {
        code: category.code,
        name: category.name,
        display_order: index,
      },
      update: { name: category.name, display_order: index },
    });
    categoryIdByCode.set(category.code, row.id);
  }

  for (const [index, diagnosis] of DIAGNOSES.entries()) {
    const category = DIAGNOSIS_CATEGORIES.find(
      (c) => c.code === diagnosis.categoryCode,
    );
    const categoryId = categoryIdByCode.get(diagnosis.categoryCode);
    if (!category || !categoryId) {
      throw new Error(
        `Categoría de diagnóstico desconocida: ${diagnosis.categoryCode}`,
      );
    }
    await prisma.diagnoses.upsert({
      where: { code: diagnosis.code },
      create: {
        code: diagnosis.code,
        category_id: categoryId,
        name: diagnosis.name,
        scope: diagnosis.scope,
        modifier: diagnosis.modifier ?? 'none',
        color: category.color,
        display_order: index,
        is_active: true,
      },
      update: {
        category_id: categoryId,
        name: diagnosis.name,
        scope: diagnosis.scope,
        modifier: diagnosis.modifier ?? 'none',
        color: category.color,
        display_order: index,
        is_active: true,
      },
    });
  }
  console.log(
    `✓ ${DIAGNOSIS_CATEGORIES.length} categorías y ${DIAGNOSES.length} diagnósticos del catálogo sincronizados.`,
  );
}

/** Diagnósticos que ya no están en el catálogo real quedan inactivos, nunca se borran (FK con ON DELETE NO ACTION en dental_exam_findings). */
async function deactivateLegacyDiagnoses() {
  const catalogCodes = DIAGNOSES.map((d) => d.code);
  const { count } = await prisma.diagnoses.updateMany({
    where: { code: { notIn: catalogCodes }, is_active: true },
    data: { is_active: false },
  });
  if (count > 0) {
    console.log(`✓ ${count} diagnósticos fuera del catálogo desactivados.`);
  }
}

/** Catálogo de condiciones médicas relevantes para la práctica odontológica (CLI-50), mismo patrón que upsertDiagnosisCatalog. */
const MEDICAL_CONDITIONS = [
  { code: 'alergias', name: 'Alergias' },
  { code: 'problemas_renales', name: 'Problemas renales' },
  { code: 'ulceras', name: 'Úlceras' },
  { code: 'reumatismo', name: 'Reumatismo' },
  { code: 'problemas_cardiacos', name: 'Problemas cardíacos' },
  { code: 'diabetes', name: 'Diabetes' },
  { code: 'hipertension', name: 'Hipertensión' },
  { code: 'hemorragias', name: 'Hemorragias' },
  { code: 'anemia', name: 'Anemia' },
  { code: 'its', name: 'ITS' },
  { code: 'asma', name: 'Asma' },
  { code: 'epilepsia', name: 'Epilepsia' },
];

async function upsertMedicalConditionsCatalog() {
  for (const [index, condition] of MEDICAL_CONDITIONS.entries()) {
    await prisma.medical_conditions.upsert({
      where: { code: condition.code },
      create: {
        code: condition.code,
        name: condition.name,
        display_order: index,
        is_active: true,
      },
      update: { name: condition.name, display_order: index, is_active: true },
    });
  }
  console.log(
    `✓ ${MEDICAL_CONDITIONS.length} condiciones médicas del catálogo sincronizadas.`,
  );
}

/** Condiciones que ya no están en el catálogo real quedan inactivas, nunca se borran (FK con ON DELETE RESTRICT en patient_medical_conditions). */
async function deactivateLegacyMedicalConditions() {
  const catalogCodes = MEDICAL_CONDITIONS.map((c) => c.code);
  const { count } = await prisma.medical_conditions.updateMany({
    where: { code: { notIn: catalogCodes }, is_active: true },
    data: { is_active: false },
  });
  if (count > 0) {
    console.log(
      `✓ ${count} condiciones médicas fuera del catálogo desactivadas.`,
    );
  }
}

/** Catálogo fijo de superficies dentales (CLI-49) — no lo edita la clínica, pero se sincroniza igual que el resto de catálogos por consistencia con la migración que las inserta. */
const TOOTH_SURFACES = [
  { code: 'vestibular', name: 'Vestibular' },
  { code: 'palatal', name: 'Palatal' },
  { code: 'lingual', name: 'Lingual' },
  { code: 'mesial', name: 'Mesial' },
  { code: 'distal', name: 'Distal' },
  { code: 'occlusal', name: 'Oclusal' },
  { code: 'incisal', name: 'Incisal' },
];

async function upsertToothSurfacesCatalog() {
  for (const [index, surface] of TOOTH_SURFACES.entries()) {
    await prisma.tooth_surfaces.upsert({
      where: { code: surface.code },
      create: { code: surface.code, name: surface.name, display_order: index },
      update: { name: surface.name, display_order: index },
    });
  }
  console.log(
    `✓ ${TOOTH_SURFACES.length} superficies dentales del catálogo sincronizadas.`,
  );
}

const DEFAULT_CONSULTATION_CODE = 'consulta_odontologica';

/** Las 8 categorías del catálogo de tratamientos (CLI-41), mismo patrón que upsertDiagnosisCatalog. */
async function upsertTreatmentCategories(): Promise<Map<string, string>> {
  const categoryIdByCode = new Map<string, string>();
  for (const [index, category] of TREATMENT_CATEGORIES.entries()) {
    const row = await prisma.treatment_categories.upsert({
      where: { code: category.code },
      create: {
        code: category.code,
        name: category.name,
        display_order: index,
        color: category.color,
      },
      update: {
        name: category.name,
        display_order: index,
        color: category.color,
      },
    });
    categoryIdByCode.set(category.code, row.id);
  }
  console.log(
    `✓ ${TREATMENT_CATEGORIES.length} categorías de tratamientos sincronizadas.`,
  );
  return categoryIdByCode;
}

/**
 * Upsert por code, no por nombre (CLI-41) — permite renombrar un ítem del
 * catálogo (p. ej. "Consulta" → "Consulta odontológica") sin duplicar la
 * fila ni desactivarla por accidente en deactivateLegacy. El `update` NO
 * toca `base_price` a propósito: el contenedor corre `prisma db seed` en
 * cada arranque, y con PATCH /treatments/:id ya disponible (CLI-14) un
 * upsert completo revertiría cualquier ajuste de precio que haga el doctor
 * en el siguiente `docker compose up`.
 */
async function upsertCatalog(categoryIdByCode: Map<string, string>) {
  for (const [index, item] of CATALOG.entries()) {
    const categoryId = categoryIdByCode.get(item.categoryCode);
    if (!categoryId) {
      throw new Error(
        `Categoría de tratamiento desconocida: ${item.categoryCode}`,
      );
    }
    await prisma.treatments.upsert({
      where: { code: item.code },
      create: {
        code: item.code,
        name: item.name,
        base_price: item.basePrice,
        application_type: item.applicationType,
        currency: item.currency,
        category_id: categoryId,
        display_order: index,
        is_active: true,
      },
      update: {
        name: item.name,
        application_type: item.applicationType,
        currency: item.currency,
        category_id: categoryId,
        display_order: index,
        is_active: true,
      },
    });
  }
  console.log(`✓ ${CATALOG.length} tratamientos del catálogo sincronizados.`);
}

/** Tratamientos que ya no están en el catálogo real quedan inactivos, nunca se borran (FKs con ON DELETE NO ACTION). */
async function deactivateLegacy() {
  const catalogCodes = CATALOG.map((t) => t.code);
  const { count } = await prisma.treatments.updateMany({
    where: { code: { notIn: catalogCodes }, is_active: true },
    data: { is_active: false },
  });
  if (count > 0) {
    console.log(`✓ ${count} tratamientos fuera del catálogo desactivados.`);
  }
}

/**
 * Monto fijo de la reserva pública (CLI-10/CLI-11). Primero libera el flag
 * de cualquier fila que no sea la consulta actual (el índice parcial único
 * solo permite una fila con is_default_consultation=true a la vez), después
 * lo marca en la fila correcta.
 */
async function syncDefaultConsultation() {
  await prisma.treatments.updateMany({
    where: {
      is_default_consultation: true,
      code: { not: DEFAULT_CONSULTATION_CODE },
    },
    data: { is_default_consultation: false },
  });
  await prisma.treatments.update({
    where: { code: DEFAULT_CONSULTATION_CODE },
    data: { is_default_consultation: true },
  });
  console.log(
    `✓ "${DEFAULT_CONSULTATION_CODE}" marcada como is_default_consultation.`,
  );
}

/**
 * Tratamientos sugeridos por diagnóstico (CLI-119), por códigos y en orden
 * de preferencia: al registrar un tratamiento en un diente con ese
 * diagnóstico el selector los muestra primero ("Sugeridos").
 *
 * PROPUESTA INICIAL — el mapeo es un criterio clínico y lo tiene que validar
 * el doctor. Diagnósticos que describen algo ya tratado (obturaciones y
 * prótesis en buen estado) no sugieren nada a propósito.
 */
const DIAGNOSIS_TREATMENT_SUGGESTIONS: Record<string, string[]> = {
  agenesia_dental: [
    'implante_dental',
    'placa_parcial_acrilico',
    'placa_parcial_flexible',
  ],
  ausencia_dental: [
    'implante_dental',
    'placa_parcial_cromo_cobalto',
    'placa_parcial_acrilico',
    'placa_parcial_flexible',
    'placa_parcial_cromoflex',
  ],
  diente_supernumerario: ['extraccion_simple', 'extraccion_quirurgica'],
  geminacion_dental: [
    'restauracion_caries_compuesta',
    'corona_porcelana_libre_metal',
  ],
  caries_primer_grado: [
    'sellante_diente_permanente',
    'restauracion_caries_simple',
    'restauracion_ionomero',
  ],
  caries_segundo_grado: [
    'restauracion_caries_simple',
    'restauracion_caries_compuesta',
    'restauracion_ionomero',
  ],
  caries_tercer_grado: [
    'restauracion_caries_compuesta',
    'conducto_unirradicular',
    'conducto_birradicular',
    'conducto_multirradicular',
  ],
  caries_cuarto_grado: [
    'conducto_unirradicular',
    'conducto_birradicular',
    'conducto_multirradicular',
    'extraccion_simple',
  ],
  obturacion_resina_recidivante: [
    'restauracion_caries_simple',
    'restauracion_caries_compuesta',
  ],
  obturacion_amalgama_recidivante: [
    'restauracion_caries_simple',
    'restauracion_caries_compuesta',
  ],
  obturacion_provisional: [
    'restauracion_caries_compuesta',
    'resina_para_munon',
  ],
  resto_radicular: ['extraccion_simple', 'extraccion_quirurgica'],
  fractura_incisal: [
    'restauracion_caries_compuesta',
    'corona_porcelana_libre_metal',
  ],
  fractura_media: [
    'restauracion_caries_compuesta',
    'conducto_unirradicular',
    'corona_provisional',
  ],
  fractura_oclusal: [
    'restauracion_caries_compuesta',
    'corona_metalica',
    'corona_porcelana_metal_plastico',
  ],
  munon_dental: [
    'perno_y_munon',
    'perno_fibra_vidrio',
    'resina_para_munon',
    'corona_provisional',
  ],
  movilidad_dental: [
    'curetaje_periodontal',
    'destartraje_limpieza_profilaxis_fluor',
    'extraccion_simple',
  ],
  endodoncia: ['perno_fibra_vidrio', 'perno_y_munon', 'corona_provisional'],
  endodoncia_pigmentacion: ['corona_porcelana_libre_metal', 'corona_ivocron'],
  endodoncia_fractura: [
    'retratamiento_conducto',
    'apicectomia',
    'extraccion_quirurgica',
  ],
  giroversion_dental: [
    'ortodoncia_brackets_metalicos',
    'ortodoncia_brackets_esteticos',
  ],
  erupcion_dental: ['sellante_diente_permanente'],
  retencion_dental: ['extraccion_quirurgica', 'extraccion_tercer_molar'],
  pericoronaritis: ['operculectomia', 'extraccion_tercer_molar'],
  gingivitis: [
    'destartraje_limpieza_profilaxis_fluor',
    'limpieza_profilaxis_fluor',
    'curetaje_periodontal',
  ],
  lesion_labio_superior: ['cirugia_lesiones_tejidos_blandos'],
  lesion_labio_inferior: ['cirugia_lesiones_tejidos_blandos'],
  lesion_mucosa_derecha: ['cirugia_lesiones_tejidos_blandos'],
  lesion_mucosa_izquierda: ['cirugia_lesiones_tejidos_blandos'],
  lesion_lengua: ['cirugia_lesiones_tejidos_blandos'],
  frenillo_lingual_bajo: ['frenectomia'],
  frenillo_labial_superior_bajo: ['frenectomia'],
  protesis_fija_recidivante: [
    'corona_provisional',
    'corona_porcelana_metal_plastico',
    'corona_porcelana_libre_metal',
  ],
  dolor_dental: ['emergencia_odontologica'],
};

/**
 * Sincroniza las sugerencias con DIAGNOSIS_TREATMENT_SUGGESTIONS: por cada
 * diagnóstico reemplaza el conjunto completo, así quitar o reordenar en el
 * seed se refleja en la base. Códigos inexistentes fallan fuerte (typo).
 */
async function upsertDiagnosisTreatmentSuggestions() {
  const diagnoses = await prisma.diagnoses.findMany({
    select: { id: true, code: true },
  });
  const treatments = await prisma.treatments.findMany({
    select: { id: true, code: true },
  });
  const diagnosisIdByCode = new Map(diagnoses.map((d) => [d.code, d.id]));
  const treatmentIdByCode = new Map(treatments.map((t) => [t.code, t.id]));

  let total = 0;
  for (const [diagnosisCode, treatmentCodes] of Object.entries(
    DIAGNOSIS_TREATMENT_SUGGESTIONS,
  )) {
    const diagnosisId = diagnosisIdByCode.get(diagnosisCode);
    if (!diagnosisId) {
      throw new Error(
        `Sugerencias: diagnóstico desconocido "${diagnosisCode}"`,
      );
    }
    const rows = treatmentCodes.map((code, index) => {
      const treatmentId = treatmentIdByCode.get(code);
      if (!treatmentId) {
        throw new Error(
          `Sugerencias de "${diagnosisCode}": tratamiento desconocido "${code}"`,
        );
      }
      return {
        diagnosis_id: diagnosisId,
        treatment_id: treatmentId,
        rank: index + 1,
      };
    });
    await prisma.$transaction([
      prisma.diagnosis_treatment_suggestions.deleteMany({
        where: { diagnosis_id: diagnosisId },
      }),
      prisma.diagnosis_treatment_suggestions.createMany({ data: rows }),
    ]);
    total += rows.length;
  }
  console.log(
    `✓ ${total} sugerencias diagnóstico → tratamiento sincronizadas.`,
  );
}

async function main() {
  const categoryIdByCode = await upsertTreatmentCategories();
  await upsertCatalog(categoryIdByCode);
  await deactivateLegacy();
  await syncDefaultConsultation();
  await upsertDiagnosisCatalog();
  await deactivateLegacyDiagnoses();
  await upsertDiagnosisTreatmentSuggestions();
  await upsertToothSurfacesCatalog();
  await upsertMedicalConditionsCatalog();
  await deactivateLegacyMedicalConditions();
  await upsertTestimonials();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
