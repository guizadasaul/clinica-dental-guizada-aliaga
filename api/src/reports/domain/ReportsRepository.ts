import type { OperationalReport, ReportParams } from './OperationalReport';
import type { FinancialReport } from './FinancialReport';
import type { TopTreatmentsReport } from './TopTreatmentsReport';

export interface IReportsRepository {
  getOperationalReport(params: ReportParams): Promise<OperationalReport>;
  getFinancialReport(params: ReportParams): Promise<FinancialReport>;
  /** doctorId opcional filtra por quién hizo el procedimiento (performed_by). */
  getTopTreatments(
    params: ReportParams & { limit: number },
  ): Promise<TopTreatmentsReport>;
}

export const ReportsRepository = Symbol('IReportsRepository');
