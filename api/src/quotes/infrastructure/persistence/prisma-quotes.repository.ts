import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type {
  IQuoteRepository,
  NewQuoteItemData,
  NewPaymentData,
} from '../../domain/QuoteRepository.js';
import type { Quote } from '../../domain/Quote.js';
import { deriveQuoteStatus } from '../../domain/QuoteStatus.js';
import { QuoteMapper } from './quote.mapper.js';

@Injectable()
export class PrismaQuotesRepository implements IQuoteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createForPatient(
    patientId: string,
    notes: string | null,
  ): Promise<Quote> {
    const record = await this.prisma.quotes.create({
      data: { patient_id: patientId, notes },
      include: { quote_items: true, payments: true },
    });
    return QuoteMapper.toDomain(record);
  }

  async findById(id: string): Promise<Quote | null> {
    const record = await this.prisma.quotes.findUnique({
      where: { id },
      include: { quote_items: true, payments: true },
    });
    return record ? QuoteMapper.toDomain(record) : null;
  }

  async findByPatient(patientId: string): Promise<Quote[]> {
    const records = await this.prisma.quotes.findMany({
      where: { patient_id: patientId },
      include: { quote_items: true, payments: true },
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
          application_group_id: item.applicationGroupId ?? null,
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
        await tx.quote_items.deleteMany({
          where: {
            quote_id: quoteId,
            application_group_id: item.application_group_id,
          },
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
    const agg = await tx.quote_items.aggregate({
      where: { quote_id: quoteId },
      _sum: { subtotal: true },
    });
    const record = await tx.quotes.update({
      where: { id: quoteId },
      data: {
        total_amount: Number(agg._sum.subtotal ?? 0),
        updated_at: new Date(),
      },
      include: { quote_items: true, payments: true },
    });
    return QuoteMapper.toDomain(record);
  }

  async addPayment(quoteId: string, data: NewPaymentData): Promise<Quote> {
    return this.prisma.transaction(async (tx) => {
      await tx.payments.create({
        data: {
          quote_id: quoteId,
          amount: data.amount,
          payment_method: data.paymentMethod ?? null,
          notes: data.notes ?? null,
        },
      });
      return this.recalculatePaymentsAndReturn(tx, quoteId);
    });
  }

  private async recalculatePaymentsAndReturn(
    tx: Prisma.TransactionClient,
    quoteId: string,
  ): Promise<Quote> {
    const [agg, quote] = await Promise.all([
      tx.payments.aggregate({
        where: { quote_id: quoteId },
        _sum: { amount: true },
      }),
      tx.quotes.findUniqueOrThrow({ where: { id: quoteId } }),
    ]);
    const totalPaid = Number(agg._sum.amount ?? 0);
    const status = deriveQuoteStatus(Number(quote.total_amount), totalPaid);
    const record = await tx.quotes.update({
      where: { id: quoteId },
      data: {
        total_paid: totalPaid,
        status,
        updated_at: new Date(),
      },
      include: { quote_items: true, payments: true },
    });
    return QuoteMapper.toDomain(record);
  }
}
