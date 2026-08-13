import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] });
const prisma = new PrismaClient({ adapter });

const treatments = [
  { name: 'Extracción simple', description: 'Extracción de pieza dental con anestesia local', base_price: 150, estimated_minutes: 30 },
  { name: 'Extracción de muela del juicio', description: 'Extracción quirúrgica de tercer molar', base_price: 350, estimated_minutes: 60 },
  { name: 'Obturación resina (1 superficie)', description: 'Restauración con resina compuesta de una superficie', base_price: 120, estimated_minutes: 45 },
  { name: 'Obturación resina (2 superficies)', description: 'Restauración con resina compuesta de dos superficies', base_price: 180, estimated_minutes: 60 },
  { name: 'Obturación resina (3 superficies)', description: 'Restauración con resina compuesta de tres o más superficies', base_price: 240, estimated_minutes: 75 },
  { name: 'Obturación amalgama', description: 'Restauración con amalgama dental', base_price: 100, estimated_minutes: 45 },
  { name: 'Endodoncia unirradicular', description: 'Tratamiento de conducto en diente de un canal', base_price: 400, estimated_minutes: 90 },
  { name: 'Endodoncia birradicular', description: 'Tratamiento de conducto en diente de dos canales', base_price: 550, estimated_minutes: 120 },
  { name: 'Endodoncia multirradicular', description: 'Tratamiento de conducto en molar (tres o más canales)', base_price: 700, estimated_minutes: 150 },
  { name: 'Corona de porcelana', description: 'Corona cerámica libre de metal', base_price: 800, estimated_minutes: 60 },
  { name: 'Corona metal-porcelana', description: 'Corona con base metálica y recubrimiento cerámico', base_price: 600, estimated_minutes: 60 },
  { name: 'Corona acrílica temporal', description: 'Corona provisional acrílica', base_price: 150, estimated_minutes: 30 },
  { name: 'Raspado y alisado radicular', description: 'Limpieza subgingival profunda por cuadrante', base_price: 200, estimated_minutes: 60 },
  { name: 'Profilaxis dental', description: 'Limpieza dental profesional y pulido', base_price: 80, estimated_minutes: 30 },
  { name: 'Blanqueamiento dental', description: 'Blanqueamiento profesional en consultorio', base_price: 300, estimated_minutes: 90 },
  { name: 'Periodoncia quirúrgica', description: 'Cirugía periodontal por cuadrante', base_price: 450, estimated_minutes: 90 },
  { name: 'Implante dental', description: 'Colocación de implante de titanio', base_price: 1200, estimated_minutes: 90 },
  { name: 'Incrustación de porcelana (inlay)', description: 'Restauración indirecta de porcelana en cavidad', base_price: 500, estimated_minutes: 90 },
  { name: 'Frenectomía', description: 'Eliminación quirúrgica del frenillo labial o lingual', base_price: 250, estimated_minutes: 30 },
  { name: 'Tratamiento de fluorización', description: 'Aplicación tópica de flúor para prevención de caries', base_price: 50, estimated_minutes: 20 },
];

async function seedTreatments() {
  const existing = await prisma.treatments.count();
  if (existing > 0) {
    console.log(`La tabla treatments ya tiene ${existing} registros — seed omitido.`);
    return;
  }

  await prisma.treatments.createMany({
    data: treatments.map((t) => ({
      name: t.name,
      description: t.description,
      base_price: t.base_price,
      estimated_minutes: t.estimated_minutes,
      is_active: true,
    })),
  });

  console.log(`✓ ${treatments.length} tratamientos insertados.`);
}

/**
 * Monto fijo de la reserva pública (CLI-10/CLI-11) mientras no existe un
 * flujo de selección de tratamiento — precio provisional, se reemplaza
 * cuando se reorganicen los tratamientos en un issue futuro.
 */
async function seedDefaultConsultationTreatment() {
  const existing = await prisma.treatments.findFirst({
    where: { is_default_consultation: true },
  });
  if (existing) {
    console.log(
      'Ya existe un tratamiento marcado is_default_consultation — seed omitido.',
    );
    return;
  }

  await prisma.treatments.create({
    data: {
      name: 'Consulta inicial',
      description:
        'Consulta odontológica inicial — reserva online (precio provisional)',
      base_price: 50,
      estimated_minutes: 30,
      is_active: true,
      is_default_consultation: true,
    },
  });

  console.log(
    '✓ Tratamiento "Consulta inicial" (is_default_consultation) insertado.',
  );
}

async function main() {
  await seedTreatments();
  await seedDefaultConsultationTreatment();
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
