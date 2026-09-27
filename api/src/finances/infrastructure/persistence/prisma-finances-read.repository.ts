import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { IFinancesReadRepository } from '../../domain/FinancesReadRepository.js';
import type { PatientBalance } from '../../domain/PatientBalance.js';

const LIST_LIMIT = 50;
const ACTIVE_STATUSES = ['pending', 'partially_paid'];

interface PatientNameParts {
  first_name: string;
  last_name_paternal: string;
  last_name_maternal: string | null;
}

function fullName(p: PatientNameParts): string {
  return [p.first_name, p.last_name_paternal, p.last_name_maternal]
    .filter(Boolean)
    .join(' ');
}

function round2(amount: number): number {
  return Math.round(amount * 100) / 100;
}

@Injectable()
export class PrismaFinancesReadRepository implements IFinancesReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listPatientsWithBalance(search?: string): Promise<PatientBalance[]> {
    const term = search?.trim();
    const where: Prisma.quotesWhereInput = {
      status: { in: ACTIVE_STATUSES },
      total_amount: { gt: 0 },
      ...(term
        ? {
            patients: {
              OR: [
                { first_name: { contains: term, mode: 'insensitive' } },
                { last_name_paternal: { contains: term, mode: 'insensitive' } },
                { last_name_maternal: { contains: term, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const records = await this.prisma.quotes.findMany({
      where,
      include: {
        patients: {
          select: {
            first_name: true,
            last_name_paternal: true,
            last_name_maternal: true,
          },
        },
      },
      orderBy: { updated_at: 'desc' },
      take: LIST_LIMIT,
    });
    return records.map((r) => {
      const totalAmount = Number(r.total_amount);
      const totalPaid = Number(r.total_paid);
      return {
        patientId: r.patient_id,
        patientName: fullName(r.patients),
        quoteId: r.id,
        totalAmount,
        totalPaid,
        balance: Math.max(0, round2(totalAmount - totalPaid)),
        sharedAt: r.shared_at,
      };
    });
  }

  async findPatientName(patientId: string): Promise<string | null> {
    const patient = await this.prisma.patients.findUnique({
      where: { id: patientId },
      select: {
        first_name: true,
        last_name_paternal: true,
        last_name_maternal: true,
      },
    });
    return patient ? fullName(patient) : null;
  }
}
