import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import {
  insertToothProcedureGroup,
  insertToothProcedures,
} from '../../../patients/infrastructure/persistence/prisma-patients.repository.js';
import type { ToothProceduresToCreate } from '../../../patients/domain/PatientRepository.js';
import {
  PlanLineTakenError,
  type ITreatmentPlanRepository,
  type PlanEffect,
  type RecordPerformedTreatmentResult,
} from '../../domain/TreatmentPlanRepository.js';
import {
  insertQuoteItemGroup,
  insertQuoteItems,
  recalculateQuote,
} from './prisma-quotes.repository.js';

@Injectable()
export class PrismaTreatmentPlanRepository implements ITreatmentPlanRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recordPerformedTreatment(
    patientId: string,
    procedures: ToothProceduresToCreate,
    plan: PlanEffect,
  ): Promise<RecordPerformedTreatmentResult> {
    try {
      return await this.prisma.transaction(async (tx) => {
        const { quoteId, itemIdByTooth } = await this.applyPlan(
          tx,
          patientId,
          plan,
        );
        const itemFor = (tooth: number | null) =>
          itemIdByTooth.get(tooth) ?? undefined;
        const created =
          procedures.kind === 'group'
            ? await insertToothProcedureGroup(tx, patientId, {
                ...procedures.group,
                teeth: procedures.group.teeth.map((t) => ({
                  ...t,
                  quoteItemId: itemFor(t.toothNumber),
                })),
              })
            : await insertToothProcedures(
                tx,
                patientId,
                procedures.rows.map((r) => ({
                  ...r,
                  quoteItemId: itemFor(r.toothNumber),
                })),
              );
        const quote = await recalculateQuote(tx, quoteId);
        return { procedures: created, quote };
      });
    } catch (error: unknown) {
      // tooth_procedures.quote_item_id es UNIQUE: otro registro cumplió la
      // misma línea entre que se leyó el presupuesto y esta transacción.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new PlanLineTakenError();
      }
      throw error;
    }
  }

  private async applyPlan(
    tx: Prisma.TransactionClient,
    patientId: string,
    plan: PlanEffect,
  ): Promise<{ quoteId: string; itemIdByTooth: Map<number | null, string> }> {
    if (plan.kind === 'fulfill') {
      if (plan.price) {
        const { unitPrice, quantity, subtotal, exchangeRate } = plan.price;
        if (plan.isGroup) {
          await tx.application_groups.update({
            where: { id: plan.lineKey, quote_id: plan.quoteId },
            data: {
              unit_price: unitPrice,
              subtotal,
              exchange_rate: exchangeRate,
            },
          });
        } else {
          await tx.quote_items.update({
            where: { id: plan.lineKey, quote_id: plan.quoteId },
            data: {
              unit_price: unitPrice,
              quantity,
              subtotal,
              exchange_rate: exchangeRate,
            },
          });
        }
      }
      return { quoteId: plan.quoteId, itemIdByTooth: plan.itemIdByTooth };
    }

    // Lo que no estaba en el plan se suma y el paciente tiene que verlo: el
    // presupuesto queda compartido (o se crea ya compartido).
    let quoteId = plan.quoteId;
    if (quoteId) {
      await tx.quotes.updateMany({
        where: { id: quoteId, shared_at: null },
        data: { shared_at: new Date() },
      });
    } else {
      const created = await tx.quotes.create({
        data: { patient_id: patientId, shared_at: new Date() },
        select: { id: true },
      });
      quoteId = created.id;
    }
    const inserted =
      plan.line.kind === 'group'
        ? await insertQuoteItemGroup(tx, quoteId, plan.line.group)
        : await insertQuoteItems(tx, quoteId, plan.line.rows);
    return {
      quoteId,
      itemIdByTooth: new Map(inserted.map((i) => [i.toothNumber, i.id])),
    };
  }
}
