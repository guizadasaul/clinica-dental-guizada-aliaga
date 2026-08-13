import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { AvailabilityResponse, HoldResponse, AppointmentContactResult } from '../models/booking.model';
import type { GuestContactRequest } from '../models/booking.request';

@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.backendUrl}/public`;

  getAvailability(date: string): Observable<AvailabilityResponse> {
    return this.http.get<AvailabilityResponse>(`${this.base}/availability`, { params: { date } });
  }

  holdSlot(slot: string): Observable<HoldResponse> {
    return this.http.post<HoldResponse>(`${this.base}/appointments/hold`, { slot });
  }

  saveGuestContact(appointmentId: string, data: GuestContactRequest): Observable<AppointmentContactResult> {
    return this.http.patch<AppointmentContactResult>(
      `${this.base}/appointments/${appointmentId}/contact`,
      data,
    );
  }
}
