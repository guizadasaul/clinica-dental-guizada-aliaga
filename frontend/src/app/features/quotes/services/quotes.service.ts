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

  getById(quoteId: string): Observable<Quote> {
    return this.http.get<Quote>(`${this.quotesBase}/${quoteId}`);
  }

  addItem(quoteId: string, data: AddQuoteItemRequest): Observable<Quote> {
    return this.http.post<Quote>(`${this.quotesBase}/${quoteId}/items`, data);
  }

  removeItem(quoteId: string, itemId: string): Observable<Quote> {
    return this.http.delete<Quote>(`${this.quotesBase}/${quoteId}/items/${itemId}`);
  }

  addPayment(quoteId: string, data: AddPaymentRequest): Observable<Quote> {
    return this.http.post<Quote>(`${this.quotesBase}/${quoteId}/payments`, data);
  }
}
