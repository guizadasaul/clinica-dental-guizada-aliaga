import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { AppointmentAgendaItem } from '../models/appointment.model';

export interface AgendaFilters {
  status?: string;
  from?: string;
  to?: string;
}

@Injectable({ providedIn: 'root' })
export class AppointmentsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.backendUrl}/appointments`;

  getAgenda(filters: AgendaFilters = {}): Observable<AppointmentAgendaItem[]> {
    const params: Record<string, string> = {};
    if (filters.status) {
      params['status'] = filters.status;
    }
    if (filters.from) {
      params['from'] = filters.from;
    }
    if (filters.to) {
      params['to'] = filters.to;
    }
    return this.http.get<AppointmentAgendaItem[]>(this.base, { params });
  }
}
