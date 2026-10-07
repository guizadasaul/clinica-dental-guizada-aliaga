import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { Quote } from '../models/quote.model';
import type {
  CreateQuoteRequest,
  AddQuoteItemRequest,
  AddPaymentRequest,
} from '../models/quote.request';
import type {
  CancelQrChargeResult,
  QrCharge,
  VerifyQrChargeResult,
} from '../../finances/models/finance.model';

@Injectable({ providedIn: 'root' })
export class QuotesService {
  private readonly http = inject(HttpClient);
  private readonly quotesBase = `${environment.backendUrl}/quotes`;
  private readonly patientsBase = `${environment.backendUrl}/patients`;

  createForPatient(patientId: string, data: CreateQuoteRequest = {}): Observable<Quote> {
    return this.http.post<Quote>(`${this.patientsBase}/${patientId}/quotes`, data);
  }

  getByPatient(patientId: string): Observable<Quote[]> {
    return this.http.get<Quote[]>(`${this.patientsBase}/${patientId}/quotes`);
  }

  /** Los presupuestos que el doctor ya compartió con el paciente logueado (CLI-156). */
  getMine(): Observable<Quote[]> {
    return this.http.get<Quote[]>(`${this.patientsBase}/me/quotes`);
  }

  // ── QR BANECO del paciente (CLI-218/219) ─────────────────────────────────

  /** Genera el QR por el saldo completo de los tratamientos elegidos (claves de línea). */
  createMyQrCharge(quoteId: string, lineKeys: string[]): Observable<QrCharge> {
    return this.http.post<QrCharge>(`${this.patientsBase}/me/quotes/${quoteId}/qr-charges`, { lineKeys });
  }

  /** El QR que generó y todavía no pagó, para retomarlo; null si no tiene. */
  getMyPendingQrCharge(): Observable<QrCharge | null> {
    return this.http.get<QrCharge | null>(`${this.patientsBase}/me/qr-charges/pending`);
  }

  /** Consulta a BANECO una sola vez — el botón "Verificar pago", sin polling. */
  verifyMyQrCharge(chargeId: string): Observable<VerifyQrChargeResult> {
    return this.http.post<VerifyQrChargeResult>(`${this.patientsBase}/me/qr-charges/${chargeId}/verify`, {});
  }

  /** Anulación segura (CLI-220): si BANECO ya lo había cobrado, registra el pago y devuelve 'paid'. */
  cancelMyQrCharge(chargeId: string): Observable<CancelQrChargeResult> {
    return this.http.post<CancelQrChargeResult>(`${this.patientsBase}/me/qr-charges/${chargeId}/cancel`, {});
  }

  getById(quoteId: string): Observable<Quote> {
    return this.http.get<Quote>(`${this.quotesBase}/${quoteId}`);
  }

  addItem(quoteId: string, data: AddQuoteItemRequest): Observable<Quote> {
    return this.http.post<Quote>(`${this.quotesBase}/${quoteId}/items`, data);
  }

  removeItem(quoteId: string, itemId: string): Observable<Quote> {
    return this.http.delete<Quote>(`${this.quotesBase}/${quoteId}/items/${itemId}`);
  }

  /** "Guardar y compartir" (CLI-156): desde acá el paciente lo ve en su panel. */
  share(quoteId: string): Observable<Quote> {
    return this.http.post<Quote>(`${this.quotesBase}/${quoteId}/share`, {});
  }

  addPayment(quoteId: string, data: AddPaymentRequest): Observable<Quote> {
    return this.http.post<Quote>(`${this.quotesBase}/${quoteId}/payments`, data);
  }
}
