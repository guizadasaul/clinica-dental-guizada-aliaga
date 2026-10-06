import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type {
  PatientBalance,
  PatientFinanceDetail,
  CancelQrChargeResult,
  QrCharge,
  VerifyQrChargeResult,
} from '../models/finance.model';

/** Finanzas del doctor (CLI-159). El pago en efectivo va por QuotesService.addPayment. */
@Injectable({ providedIn: 'root' })
export class FinancesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.backendUrl}/finances`;

  listPatients(search = ''): Observable<PatientBalance[]> {
    const term = search.trim();
    const params = term ? new HttpParams().set('search', term) : undefined;
    return this.http.get<PatientBalance[]>(`${this.base}/patients`, { params });
  }

  getPatientDetail(patientId: string): Observable<PatientFinanceDetail> {
    return this.http.get<PatientFinanceDetail>(`${this.base}/patients/${patientId}`);
  }

  createQrCharge(quoteId: string, amount: number): Observable<QrCharge> {
    return this.http.post<QrCharge>(`${this.base}/quotes/${quoteId}/qr-charges`, { amount });
  }

  /** Consulta a BANECO una sola vez — el botón "Verificar pago", sin polling. */
  verifyQrCharge(chargeId: string): Observable<VerifyQrChargeResult> {
    return this.http.post<VerifyQrChargeResult>(`${this.base}/qr-charges/${chargeId}/verify`, {});
  }

  /** Anulación segura (CLI-220): si BANECO ya lo había cobrado, registra el pago y devuelve 'paid'. */
  cancelQrCharge(chargeId: string): Observable<CancelQrChargeResult> {
    return this.http.post<CancelQrChargeResult>(`${this.base}/qr-charges/${chargeId}/cancel`, {});
  }
}
