/**
 * Backfill de CLI-227: vincula los tratamientos ya registrados con su línea
 * del presupuesto y suma al presupuesto los que no estaban en el plan, con
 * las mismas reglas que el registro desde CLI-226 (TreatmentPlanService).
 *
 * - Va paciente por paciente, cada uno en su propia transacción, y cada
 *   paciente procesa sus tratamientos sin vincular del más viejo al más
 *   nuevo.
 * - Si coincide con una línea por realizar, la vincula SIN cambiar su precio:
 *   el precio del presupuesto ya acordado no se toca hacia atrás.
 * - Si no coincide, suma una línea al presupuesto abierto (o a uno nuevo),
 *   compartido, con el precio que se cobró. Un tratamiento en USD fuera del
 *   plan no se suma (no hay tipo de cambio de esa fecha): queda en el
 *   reporte para revisarlo a mano.
 * - Idempotente: solo mira tratamientos sin vincular.
 *
 * Sin --apply es un dry-run: hace el mismo recorrido dentro de cada
 * transacción y la revierte, así el reporte es exactamente lo que pasaría.
 *
 *   npx ts-node prisma/backfill-quote-procedures.ts           # dry-run
 *   npx ts-node prisma/backfill-quote-procedures.ts --apply   # aplica
 */
import 'dotenv/config';
import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { pgConnectionConfig } from '../src/shared/prisma/pg-connection';
import { QuoteMapper } from '../src/quotes/infrastructure/persistence/quote.mapper';
import {
  QUOTE_INCLUDE,
  insertQuoteItemGroup,
  insertQuoteItems,
  recalculateQuote,
} from '../src/quotes/infrastructure/persistence/quote-writes';
import {
  findOpenQuote,
  findPlanLine,
} from '../src/quotes/domain/QuotePlanMatching';
import {
  buildQuoteLine,
  round2,
} from '../src/quotes/application/quote-pricing';
import type { Quote } from '../src/quotes/domain/Quote';

const APPLY = process.argv.includes('--apply');

const adapter = new PrismaPg(pgConnectionConfig());
const prisma = new PrismaClient({ adapter });

const PROCEDURE_SELECT = {
  id: true,
  tooth_number: true,
  application_group_id: true,
  price_charged: true,
  quantity: true,
  procedure_date: true,
  created_at: true,
  application_groups: { select: { unit_price: true } },
  treatments: {
    select: {
      id: true,
      name: true,
      application_type: true,
      currency: true,
    },
  },
} satisfies Prisma.tooth_proceduresSelect;

type ProcedureRow = Prisma.tooth_proceduresGetPayload<{
  select: typeof PROCEDURE_SELECT;
}>;

interface PatientReport {
  patient: string;
  linked: number;
  added: number;
  addedBob: number;
  debtBefore: number;
  debtAfter: number;
  skipped: string[];
}

/** Sale de la transacción para revertirla en el dry-run, con el reporte. */
class DryRunRollback extends Error {
  constructor(readonly report: PatientReport) {
    super('dry-run');
  }
}

async function quotesOf(
  tx: Prisma.TransactionClient,
  patientId: string,
): Promise<Quote[]> {
  const records = await tx.quotes.findMany({
    where: { patient_id: patientId },
    include: QUOTE_INCLUDE,
    orderBy: { created_at: 'desc' },
  });
  return records.map((r) => QuoteMapper.toDomain(r));
}

const debtOf = (quotes: Quote[]) =>
  round2(quotes.reduce((sum, q) => sum + q.balance, 0));

/** Un tratamiento registrado: una fila suelta, o las filas de un grupo multi-diente. */
function units(rows: ProcedureRow[]): ProcedureRow[][] {
  const byKey = new Map<string, ProcedureRow[]>();
  for (const row of rows) {
    const key = row.application_group_id ?? row.id;
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }
  return [...byKey.values()];
}

const dateOf = (d: Date) => d.toISOString().slice(0, 10);

async function linkRows(
  tx: Prisma.TransactionClient,
  rows: ProcedureRow[],
  itemIdByTooth: Map<number | null, string>,
): Promise<void> {
  for (const row of rows) {
    const itemId = itemIdByTooth.get(row.tooth_number);
    if (itemId) {
      await tx.tooth_procedures.update({
        where: { id: row.id },
        data: { quote_item_id: itemId },
      });
    }
  }
}

async function backfillPatient(
  tx: Prisma.TransactionClient,
  patientId: string,
  patientName: string,
  rows: ProcedureRow[],
): Promise<PatientReport> {
  const report: PatientReport = {
    patient: patientName,
    linked: 0,
    added: 0,
    addedBob: 0,
    debtBefore: debtOf(await quotesOf(tx, patientId)),
    debtAfter: 0,
    skipped: [],
  };

  for (const unit of units(rows)) {
    const [first] = unit;
    const treatment = first.treatments;
    const applicationType = treatment.application_type;
    const toothNumbers = unit
      .map((r) => r.tooth_number)
      .filter((n): n is number => n !== null);
    const quotes = await quotesOf(tx, patientId);

    const match = findPlanLine(quotes, {
      treatmentId: treatment.id,
      applicationType,
      toothNumbers,
    });
    if (match) {
      await linkRows(
        tx,
        unit,
        new Map(match.items.map((i) => [i.toothNumber, i.id])),
      );
      report.linked += 1;
      continue;
    }

    const label = `${treatment.name} (${dateOf(first.procedure_date)})`;
    const price = Number(
      first.application_groups?.unit_price ?? first.price_charged ?? 0,
    );
    if (treatment.currency === 'USD') {
      report.skipped.push(`${label}: en USD, revisar a mano`);
      continue;
    }
    if (price <= 0) {
      report.skipped.push(`${label}: sin precio cobrado`);
      continue;
    }

    const quantity = first.quantity > 0 ? first.quantity : 1;
    const line = buildQuoteLine(
      applicationType,
      toothNumbers,
      treatment.id,
      round2(price / quantity),
      quantity,
      treatment.currency,
      null,
    );
    const open = findOpenQuote(quotes);
    let quoteId = open?.id;
    if (quoteId) {
      await tx.quotes.updateMany({
        where: { id: quoteId, shared_at: null },
        data: { shared_at: new Date() },
      });
    } else {
      quoteId = (
        await tx.quotes.create({
          data: { patient_id: patientId, shared_at: new Date() },
          select: { id: true },
        })
      ).id;
    }
    const inserted =
      line.kind === 'group'
        ? await insertQuoteItemGroup(tx, quoteId, line.group)
        : await insertQuoteItems(tx, quoteId, line.rows);
    await linkRows(
      tx,
      unit,
      new Map(inserted.map((i) => [i.toothNumber, i.id])),
    );
    await recalculateQuote(tx, quoteId);
    report.added += 1;
    report.addedBob = round2(report.addedBob + price);
  }

  report.debtAfter = debtOf(await quotesOf(tx, patientId));
  return report;
}

async function main(): Promise<void> {
  const pending = await prisma.tooth_procedures.findMany({
    where: { quote_item_id: null },
    select: {
      ...PROCEDURE_SELECT,
      patient_id: true,
      patients: { select: { first_name: true, last_name_paternal: true } },
    },
    orderBy: [{ procedure_date: 'asc' }, { created_at: 'asc' }],
  });

  const byPatient = new Map<string, typeof pending>();
  for (const row of pending) {
    byPatient.set(row.patient_id, [
      ...(byPatient.get(row.patient_id) ?? []),
      row,
    ]);
  }

  console.log(
    `${APPLY ? 'APLICANDO' : 'DRY-RUN (no escribe nada)'}: ${pending.length} tratamientos sin vincular de ${byPatient.size} pacientes.`,
  );

  const reports: PatientReport[] = [];
  for (const [patientId, rows] of byPatient) {
    const name = `${rows[0].patients.first_name} ${rows[0].patients.last_name_paternal}`;
    try {
      const report = await prisma.$transaction(
        async (tx) => {
          const result = await backfillPatient(tx, patientId, name, rows);
          if (!APPLY) {
            throw new DryRunRollback(result);
          }
          return result;
        },
        { timeout: 60_000 },
      );
      reports.push(report);
    } catch (error: unknown) {
      if (error instanceof DryRunRollback) {
        reports.push(error.report);
      } else {
        throw error;
      }
    }
  }

  for (const r of reports) {
    const delta = round2(r.debtAfter - r.debtBefore);
    console.log(
      `- ${r.patient}: ${r.linked} vinculados, ${r.added} sumados (Bs ${r.addedBob.toFixed(2)}); deuda Bs ${r.debtBefore.toFixed(2)} → Bs ${r.debtAfter.toFixed(2)} (${delta >= 0 ? '+' : ''}${delta.toFixed(2)})`,
    );
    for (const s of r.skipped) {
      console.log(`    sin sumar: ${s}`);
    }
  }
  const sum = (pick: (r: PatientReport) => number) =>
    reports.reduce((acc, r) => acc + pick(r), 0);
  console.log(
    `TOTAL: ${sum((r) => r.linked)} vinculados, ${sum((r) => r.added)} sumados; la deuda sube Bs ${round2(sum((r) => r.debtAfter - r.debtBefore)).toFixed(2)}; ${sum((r) => r.skipped.length)} sin sumar para revisar.`,
  );
  if (!APPLY) {
    console.log('Dry-run: no se guardó nada. Para aplicar: --apply');
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
