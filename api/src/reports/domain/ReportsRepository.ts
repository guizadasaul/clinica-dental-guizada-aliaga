import type { OperationalReport, ReportParams } from './OperationalReport';
import type { FinancialReport } from './FinancialReport';

export interface IReportsRepository {
  getOperationalReport(params: ReportParams): Promise<OperationalReport>;
  getFinancialReport(params: ReportParams): Promise<FinancialReport>;
}

export const ReportsRepository = Symbol('IReportsRepository');
