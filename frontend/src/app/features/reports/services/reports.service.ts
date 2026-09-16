import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { FinancialReport, OperationalReport } from '../models/report.model';

export interface ReportFilters {
  /** YYYY-MM-DD, inclusive. */
  from: string;
  /** YYYY-MM-DD, inclusive. */
  to: string;
  doctorId?: string;
}

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.backendUrl}/admin/reports`;

  getOperational(filters: ReportFilters): Observable<OperationalReport> {
    return this.http.get<OperationalReport>(`${this.base}/operational`, {
      params: this.toParams(filters),
    });
  }

  getFinancial(filters: ReportFilters): Observable<FinancialReport> {
    return this.http.get<FinancialReport>(`${this.base}/financial`, {
      params: this.toParams(filters),
    });
  }

  private toParams(filters: ReportFilters): Record<string, string> {
    const params: Record<string, string> = { from: filters.from, to: filters.to };
    if (filters.doctorId) {
      params['doctorId'] = filters.doctorId;
    }
    return params;
  }
}
