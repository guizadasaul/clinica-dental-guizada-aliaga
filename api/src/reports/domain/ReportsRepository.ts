import type { OperationalReport, ReportParams } from './OperationalReport';
import type { FinancialReport } from './FinancialReport';
import type { TopTreatmentsReport } from './TopTreatmentsReport';
import type { TrendsReport } from './TrendsReport';

export interface IReportsRepository {
  getOperationalReport(params: ReportParams): Promise<OperationalReport>;
  getFinancialReport(params: ReportParams): Promise<FinancialReport>;
  /** doctorId opcional filtra por quién hizo el procedimiento (performed_by). */
  getTopTreatments(
    params: ReportParams & { limit: number },
  ): Promise<TopTreatmentsReport>;
  /** Serie diaria de citas por estado y cobrado (CLI-199). */
  getTrends(params: ReportParams): Promise<TrendsReport>;
}

export const ReportsRepository = Symbol('IReportsRepository');
