import { PrismaClient } from '@prisma/client';
import type { TreatmentScope } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] });
const prisma = new PrismaClient({ adapter });

interface SeedTreatment {
  name: string;
  base_price: number;
  scope: TreatmentScope;
  currency: 'BOB' | 'USD';
}

/**
 * Catálogo real de la clínica (64 tratamientos, CLI-18). Todo en BOB salvo
 * Implante (USD). "Curetaje", "Gingivoplastia", "Operculectomía" y las tres
 * reposiciones de ortodoncia (bracket metálico, bandas, bracket estético)
 * vinieron sin alcance anotado a mano — se asume `tooth` por ser consistente
 * con el patrón del resto del catálogo (todo lo que no es `tooth` viene
 * anotado explícitamente).
 */
const CATALOG: SeedTreatment[] = [
  // Básicos
  { name: 'Consulta', base_price: 50, scope: 'none', currency: 'BOB' },
  { name: 'Emergencia', base_price: 100, scope: 'none', currency: 'BOB' },
  {
    name: 'Certificado odontológico',
    base_price: 150,
    scope: 'none',
    currency: 'BOB',
  },

  // Operatoria
  { name: 'Caries simple', base_price: 180, scope: 'tooth', currency: 'BOB' },
  {
    name: 'Caries compuesta',
    base_price: 250,
    scope: 'tooth',
    currency: 'BOB',
  },
  {
    name: 'Resina para muñón',
    base_price: 80,
    scope: 'tooth',
    currency: 'BOB',
  },
  { name: 'Ionómero', base_price: 80, scope: 'tooth', currency: 'BOB' },
  {
    name: 'Resina en diente temporal',
    base_price: 80,
    scope: 'tooth',
    currency: 'BOB',
  },
  {
    name: 'Sellante en diente permanente',
    base_price: 100,
    scope: 'tooth',
    currency: 'BOB',
  },
  {
    name: 'Sellante en diente temporal',
    base_price: 80,
    scope: 'tooth',
    currency: 'BOB',
  },
  {
    name: 'Blanqueamiento dental láser',
    base_price: 1000,
    scope: 'full_mouth',
    currency: 'BOB',
  },

  // Periodoncia
  {
    name: 'Limpieza, profilaxis y flúor',
    base_price: 250,
    scope: 'full_mouth',
    currency: 'BOB',
  },
  {
    name: 'Gingivectomía superior',
    base_price: 400,
    scope: 'upper_arch',
    currency: 'BOB',
  },
  {
    name: 'Gingivectomía inferior',
    base_price: 400,
    scope: 'lower_arch',
    currency: 'BOB',
  },
  {
    name: 'Gingivectomía completa',
    base_price: 800,
    scope: 'full_mouth',
    currency: 'BOB',
  },
  { name: 'Curetaje', base_price: 150, scope: 'tooth', currency: 'BOB' },
  { name: 'Gingivoplastia', base_price: 200, scope: 'tooth', currency: 'BOB' },
  {
    name: 'Destartraje, limpieza, profilaxis y flúor',
    base_price: 350,
    scope: 'full_mouth',
    currency: 'BOB',
  },

  // Endodoncia
  {
    name: 'Tratamiento de conducto unirradicular',
    base_price: 300,
    scope: 'tooth',
    currency: 'BOB',
  },
  {
    name: 'Tratamiento de conducto birradicular',
    base_price: 350,
    scope: 'tooth',
    currency: 'BOB',
  },
  {
    name: 'Tratamiento de conducto multirradicular',
    base_price: 450,
    scope: 'tooth',
    currency: 'BOB',
  },
  {
    name: 'Retratamiento de conducto',
    base_price: 400,
    scope: 'tooth',
    currency: 'BOB',
  },

  // Cirugía
  {
    name: 'Extracción simple',
    base_price: 100,
    scope: 'tooth',
    currency: 'BOB',
  },
  {
    name: 'Extracción quirúrgica',
    base_price: 500,
    scope: 'tooth',
    currency: 'BOB',
  },
  {
    name: 'Extracción de tercer molar',
    base_price: 600,
    scope: 'tooth',
    currency: 'BOB',
  },
  { name: 'Operculectomía', base_price: 200, scope: 'tooth', currency: 'BOB' },
  { name: 'Apicectomía', base_price: 450, scope: 'tooth', currency: 'BOB' },
  { name: 'Implante', base_price: 700, scope: 'tooth', currency: 'USD' },
  {
    name: 'Cirugía de lesiones en tejidos blandos',
    base_price: 500,
    scope: 'none',
    currency: 'BOB',
  },
  { name: 'Frenectomía', base_price: 800, scope: 'none', currency: 'BOB' },

  // Prótesis removible
  {
    name: 'Placa parcial de cromo-cobalto',
    base_price: 1400,
    scope: 'multi_tooth',
    currency: 'BOB',
  },
  {
    name: 'Placa parcial de acrílico',
    base_price: 1000,
    scope: 'multi_tooth',
    currency: 'BOB',
  },
  {
    name: 'Placa total de acrílico superior',
    base_price: 1500,
    scope: 'upper_arch',
    currency: 'BOB',
  },
  {
    name: 'Placa total de acrílico inferior',
    base_price: 1500,
    scope: 'lower_arch',
    currency: 'BOB',
  },
  {
    name: 'Placa total de acrílico completa Bonwill',
    base_price: 2500,
    scope: 'full_mouth',
    currency: 'BOB',
  },
  {
    name: 'Placa parcial flexible',
    base_price: 1500,
    scope: 'multi_tooth',
    currency: 'BOB',
  },
  {
    name: 'Placa parcial Cromoflex',
    base_price: 1700,
    scope: 'multi_tooth',
    currency: 'BOB',
  },
  {
    name: 'Reparación de prótesis',
    base_price: 300,
    scope: 'none',
    currency: 'BOB',
  },
  {
    name: 'Rebasado total en laboratorio',
    base_price: 400,
    scope: 'none',
    currency: 'BOB',
  },
  {
    name: 'Rebasado en clínica',
    base_price: 200,
    scope: 'none',
    currency: 'BOB',
  },
  {
    name: 'Placa de miorelajación',
    base_price: 350,
    scope: 'upper_arch',
    currency: 'BOB',
  },
  {
    name: 'Protector bucal',
    base_price: 700,
    scope: 'upper_arch',
    currency: 'BOB',
  },

  // Prótesis fija
  {
    name: 'Corona provisional',
    base_price: 100,
    scope: 'tooth',
    currency: 'BOB',
  },
  {
    name: 'Perno de fibra de vidrio',
    base_price: 350,
    scope: 'tooth',
    currency: 'BOB',
  },
  { name: 'Perno + muñón', base_price: 250, scope: 'tooth', currency: 'BOB' },
  { name: 'Corona metálica', base_price: 350, scope: 'tooth', currency: 'BOB' },
  {
    name: 'Corona de Ivocron',
    base_price: 550,
    scope: 'tooth',
    currency: 'BOB',
  },
  {
    name: 'Corona de Isosit',
    base_price: 750,
    scope: 'tooth',
    currency: 'BOB',
  },
  {
    name: 'Corona de porcelana sobre metal o plástico',
    base_price: 950,
    scope: 'tooth',
    currency: 'BOB',
  },
  {
    name: 'Corona de porcelana libre de metal',
    base_price: 1200,
    scope: 'tooth',
    currency: 'BOB',
  },

  // Ortodoncia
  {
    name: 'Ortodoncia con brackets metálicos',
    base_price: 6800,
    scope: 'full_mouth',
    currency: 'BOB',
  },
  {
    name: 'Reposición de bracket metálico',
    base_price: 150,
    scope: 'tooth',
    currency: 'BOB',
  },
  {
    name: 'Reposición de bandas',
    base_price: 150,
    scope: 'tooth',
    currency: 'BOB',
  },
  {
    name: 'Reposición de arco',
    base_price: 50,
    scope: 'none',
    currency: 'BOB',
  },
  {
    name: 'Ortodoncia con brackets estéticos',
    base_price: 8300,
    scope: 'full_mouth',
    currency: 'BOB',
  },
  {
    name: 'Reposición de bracket estético',
    base_price: 200,
    scope: 'tooth',
    currency: 'BOB',
  },
  {
    name: 'Placa de expansión removible',
    base_price: 500,
    scope: 'none',
    currency: 'BOB',
  },
  {
    name: 'Placa de expansión fija',
    base_price: 1000,
    scope: 'none',
    currency: 'BOB',
  },
  {
    name: 'Placa de contención superior',
    base_price: 400,
    scope: 'upper_arch',
    currency: 'BOB',
  },
  {
    name: 'Placa de contención inferior',
    base_price: 400,
    scope: 'lower_arch',
    currency: 'BOB',
  },
  {
    name: 'Placa de contención completa',
    base_price: 800,
    scope: 'full_mouth',
    currency: 'BOB',
  },
  { name: 'Máscara facial', base_price: 3500, scope: 'none', currency: 'BOB' },
  {
    name: 'Elásticos de clase',
    base_price: 20,
    scope: 'none',
    currency: 'BOB',
  },
  { name: 'Cera ortodóntica', base_price: 30, scope: 'none', currency: 'BOB' },
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

const DEFAULT_CONSULTATION_NAME = 'Consulta';

/**
 * Upsert por nombre, no createMany con guard de tabla completa — permite
 * cargar ítems nuevos del catálogo en el futuro sin duplicar los actuales.
 * El `update` NO toca `base_price` a propósito: el contenedor corre
 * `prisma db seed` en cada arranque, y con PATCH /treatments/:id ya
 * disponible (CLI-14) un upsert completo revertiría cualquier ajuste de
 * precio que haga el doctor en el siguiente `docker compose up`.
 */
async function upsertCatalog() {
  for (const item of CATALOG) {
    await prisma.treatments.upsert({
      where: { name: item.name },
      create: {
        name: item.name,
        base_price: item.base_price,
        scope: item.scope,
        currency: item.currency,
        is_active: true,
      },
      update: {
        scope: item.scope,
        currency: item.currency,
        is_active: true,
      },
    });
  }
  console.log(`✓ ${CATALOG.length} tratamientos del catálogo sincronizados.`);
}

/** Tratamientos que ya no están en el catálogo real quedan inactivos, nunca se borran (FKs con ON DELETE NO ACTION). */
async function deactivateLegacy() {
  const catalogNames = CATALOG.map((t) => t.name);
  const { count } = await prisma.treatments.updateMany({
    where: { name: { notIn: catalogNames }, is_active: true },
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
      name: { not: DEFAULT_CONSULTATION_NAME },
    },
    data: { is_default_consultation: false },
  });
  await prisma.treatments.update({
    where: { name: DEFAULT_CONSULTATION_NAME },
    data: { is_default_consultation: true },
  });
  console.log(
    `✓ "${DEFAULT_CONSULTATION_NAME}" marcada como is_default_consultation.`,
  );
}

async function main() {
  await upsertCatalog();
  await deactivateLegacy();
  await syncDefaultConsultation();
  await upsertDiagnosisCatalog();
  await deactivateLegacyDiagnoses();
  await upsertTestimonials();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
