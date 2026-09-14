import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  IQuoteRepository,
  NewQuoteItemData,
  NewQuoteItemGroupData,
} from '../../domain/QuoteRepository.js';
import type { Quote } from '../../domain/Quote.js';
import { QuoteMapper } from './quote.mapper.js';

const ITEMS_WITH_GROUP_INCLUDE = {
  quote_items: { include: { application_groups: true } },
} as const;

@Injectable()
export class PrismaQuotesRepository implements IQuoteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createForPatient(
    patientId: string,
    notes: string | null,
  ): Promise<Quote> {
    const record = await this.prisma.quotes.create({
      data: { patient_id: patientId, notes },
      include: ITEMS_WITH_GROUP_INCLUDE,
    });
    return QuoteMapper.toDomain(record);
  }

  async findById(id: string): Promise<Quote | null> {
    const record = await this.prisma.quotes.findUnique({
      where: { id },
      include: ITEMS_WITH_GROUP_INCLUDE,
    });
    return record ? QuoteMapper.toDomain(record) : null;
  }

  async findByPatient(patientId: string): Promise<Quote[]> {
    const records = await this.prisma.quotes.findMany({
      where: { patient_id: patientId },
      include: ITEMS_WITH_GROUP_INCLUDE,
      orderBy: { created_at: 'desc' },
    });
    return records.map((r) => QuoteMapper.toDomain(r));
  }

  async addItems(quoteId: string, items: NewQuoteItemData[]): Promise<Quote> {
    return this.prisma.transaction(async (tx) => {
      await tx.quote_items.createMany({
        data: items.map((item) => ({
          quote_id: quoteId,
          treatment_id: item.treatmentId,
          tooth_number: item.toothNumber,
          unit_price: item.unitPrice,
          quantity: item.quantity,
          subtotal: item.subtotal,
          currency: item.currency,
          exchange_rate: item.exchangeRate ?? null,
        })),
      });
      return this.recalculateAndReturn(tx, quoteId);
    });
  }

  // CLI-45: el precio del grupo vive una sola vez en application_groups —
  // las N filas de quote_items (una por diente) no tienen precio propio, a
  // diferencia del viejo esquema donde una fila arbitraria lo tenía y el
  // resto facturaba 0.
  async addItemGroup(
    quoteId: string,
    data: NewQuoteItemGroupData,
  ): Promise<Quote> {
    return this.prisma.transaction(async (tx) => {
      const group = await tx.application_groups.create({
        data: {
          quote_id: quoteId,
          treatment_id: data.treatmentId,
          unit_price: data.unitPrice,
          subtotal: data.subtotal,
          currency: data.currency,
          exchange_rate: data.exchangeRate ?? null,
        },
      });
      await tx.quote_items.createMany({
        data: data.toothNumbers.map((toothNumber) => ({
          quote_id: quoteId,
          treatment_id: data.treatmentId,
          tooth_number: toothNumber,
          application_group_id: group.id,
        })),
      });
      return this.recalculateAndReturn(tx, quoteId);
    });
  }

  async removeItemGroup(
    quoteId: string,
    itemId: string,
  ): Promise<Quote | null> {
    return this.prisma.transaction(async (tx) => {
      const item = await tx.quote_items.findUnique({ where: { id: itemId } });
      if (!item || item.quote_id !== quoteId) {
        return null;
      }
      if (item.application_group_id) {
        // Borra el grupo entero de una — sus quote_items caen por ON DELETE
        // CASCADE (una aplicación multi_tooth se cobra/borra como unidad).
        await tx.application_groups.delete({
          where: { id: item.application_group_id },
        });
      } else {
        await tx.quote_items.delete({ where: { id: itemId } });
      }
      return this.recalculateAndReturn(tx, quoteId);
    });
  }

  private async recalculateAndReturn(
    tx: Prisma.TransactionClient,
    quoteId: string,
  ): Promise<Quote> {
    // total_amount suma dos fuentes que nunca se solapan: subtotal de las
    // filas sueltas (application_group_id NULL) + subtotal de cada grupo
    // (una vez por grupo, sin importar cuántos dientes tenga) — CLI-45.
    const [itemsAgg, groupsAgg] = await Promise.all([
      tx.quote_items.aggregate({
        where: { quote_id: quoteId },
        _sum: { subtotal: true },
      }),
      tx.application_groups.aggregate({
        where: { quote_id: quoteId },
        _sum: { subtotal: true },
      }),
    ]);
    const totalAmount =
      Number(itemsAgg._sum.subtotal ?? 0) + Number(groupsAgg._sum.subtotal ?? 0);
    const record = await tx.quotes.update({
      where: { id: quoteId },
      data: {
        total_amount: totalAmount,
        updated_at: new Date(),
      },
      include: ITEMS_WITH_GROUP_INCLUDE,
    });
    return QuoteMapper.toDomain(record);
  }
}
