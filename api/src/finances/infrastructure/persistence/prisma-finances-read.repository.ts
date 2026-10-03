import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { IFinancesReadRepository } from '../../domain/FinancesReadRepository.js';
import type { PatientBalance } from '../../domain/PatientBalance.js';

// Tope de seguridad, no de paginado: una clínica tiene cientos de pacientes y
// el selector de Finanzas los lista a todos (CLI-190).
const LIST_LIMIT = 1000;
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

/** Minúsculas y sin tildes: "perez" encuentra "Pérez". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

@Injectable()
export class PrismaFinancesReadRepository implements IFinancesReadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listPatientsWithBalance(search?: string): Promise<PatientBalance[]> {
    const records = await this.prisma.patients.findMany({
      where: { deleted_at: null },
      select: {
        id: true,
        first_name: true,
        last_name_paternal: true,
        last_name_maternal: true,
        created_at: true,
        tooth_procedures: {
          orderBy: { created_at: 'desc' },
          take: 1,
          select: { created_at: true },
        },
        quotes: {
          where: { status: { in: ACTIVE_STATUSES }, total_amount: { gt: 0 } },
          orderBy: { updated_at: 'desc' },
          take: 1,
          select: {
            id: true,
            total_amount: true,
            total_paid: true,
            shared_at: true,
          },
        },
      },
    });

    // Cada palabra buscada tiene que estar en el nombre completo: así
    // "ana perez" encuentra a "Ana María Pérez" (la búsqueda es en memoria
    // porque Prisma no ignora tildes y la lista es de cientos, no de miles).
    const words = normalize(search ?? '')
      .split(/\s+/)
      .filter(Boolean);

    return records
      .map((r) => {
        const quote = r.quotes[0];
        const totalAmount = quote ? Number(quote.total_amount) : 0;
        const totalPaid = quote ? Number(quote.total_paid) : 0;
        return {
          createdAt: r.created_at,
          row: {
            patientId: r.id,
            patientName: fullName(r),
            quoteId: quote?.id ?? null,
            totalAmount,
            totalPaid,
            balance: Math.max(0, round2(totalAmount - totalPaid)),
            sharedAt: quote?.shared_at ?? null,
            lastTreatmentAt: r.tooth_procedures[0]?.created_at ?? null,
          } satisfies PatientBalance,
        };
      })
      .filter(({ row }) => {
        const name = normalize(row.patientName);
        return words.every((w) => name.includes(w));
      })
      .sort((a, b) => {
        const ta = a.row.lastTreatmentAt?.getTime() ?? -Infinity;
        const tb = b.row.lastTreatmentAt?.getTime() ?? -Infinity;
        // Los que nunca recibieron un tratamiento van al final, el más nuevo primero.
        return tb - ta || b.createdAt.getTime() - a.createdAt.getTime();
      })
      .slice(0, LIST_LIMIT)
      .map(({ row }) => row);
  }

  async findPatientName(patientId: string): Promise<string | null> {
    const patient = await this.prisma.patients.findUnique({
      where: { id: patientId, deleted_at: null },
      select: {
        first_name: true,
        last_name_paternal: true,
        last_name_maternal: true,
      },
    });
    return patient ? fullName(patient) : null;
  }
}
