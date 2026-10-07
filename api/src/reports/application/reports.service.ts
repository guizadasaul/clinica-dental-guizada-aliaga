import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ReportsRepository } from '../domain/ReportsRepository';
import type { IReportsRepository } from '../domain/ReportsRepository';
import type { OperationalReport } from '../domain/OperationalReport';
import type { FinancialReport } from '../domain/FinancialReport';
import type { TopTreatmentsReport } from '../domain/TopTreatmentsReport';
import type { TrendsReport } from '../domain/TrendsReport';
import { CLINIC_UTC_OFFSET } from '../../appointments/domain/ClinicSchedule';

export interface ReportQuery {
  /** YYYY-MM-DD, inclusive. */
  from: string;
  /** YYYY-MM-DD, inclusive (el service lo convierte a límite exclusivo). */
  to: string;
  doctorId?: string;
}

// Bolivia no tiene horario de verano (UTC-4 fijo) — sumar un día de
// calendario en UTC es seguro, mismo criterio que addDaysToDateString en
// appointments/application/appointments.service.ts (duplicado a propósito,
// es una utilidad de 4 líneas y este módulo no depende de appointments/).
function nextDateString(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Un año y un poco: la serie es día por día, no tiene sentido pedir más. */
const MAX_TREND_DAYS = 400;

@Injectable()
export class ReportsService {
  constructor(
    @Inject(ReportsRepository)
    private readonly reportsRepo: IReportsRepository,
  ) {}

  async getOperationalReport(query: ReportQuery): Promise<OperationalReport> {
    const params = this.parseRange(query);
    return this.reportsRepo.getOperationalReport(params);
  }

  async getFinancialReport(query: ReportQuery): Promise<FinancialReport> {
    const params = this.parseRange(query);
    return this.reportsRepo.getFinancialReport(params);
  }

  async getTopTreatments(
    query: ReportQuery & { limit: number },
  ): Promise<TopTreatmentsReport> {
    const params = this.parseRange(query);
    return this.reportsRepo.getTopTreatments({ ...params, limit: query.limit });
  }

  async getTrends(query: ReportQuery): Promise<TrendsReport> {
    const params = this.parseRange(query);
    if (params.to.getTime() - params.from.getTime() > MAX_TREND_DAYS * DAY_MS) {
      throw new BadRequestException(
        `El rango de la serie diaria no puede superar los ${MAX_TREND_DAYS} días`,
      );
    }
    return this.reportsRepo.getTrends(params);
  }

  /**
   * `from`/`to` llegan como YYYY-MM-DD, los dos inclusive. Se normalizan acá
   * a [gte, lt) en el huso horario de la clínica (mismo offset fijo que usa
   * ClinicSchedule para armar slots), sumándole un día a `to` para volverlo
   * el límite superior exclusivo — así el propio repositorio nunca tiene que
   * pensar en inclusive/exclusive.
   */
  private parseRange(query: ReportQuery): {
    from: Date;
    to: Date;
    doctorId?: string;
  } {
    const from = new Date(`${query.from}T00:00:00${CLINIC_UTC_OFFSET}`);
    const to = new Date(
      `${nextDateString(query.to)}T00:00:00${CLINIC_UTC_OFFSET}`,
    );
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from >= to
    ) {
      throw new BadRequestException(
        'Rango de fechas inválido: from debe ser anterior o igual a to',
      );
    }
    return {
      from,
      to,
      ...(query.doctorId && { doctorId: query.doctorId }),
    };
  }
}
