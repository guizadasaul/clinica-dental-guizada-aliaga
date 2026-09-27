import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { AppointmentAgendaItem, DoctorScheduleBlock } from '../models/appointment.model';
import type {
  CreateDoctorAppointmentRequest,
  RescheduleDoctorAppointmentRequest,
} from '../models/appointment.request';

export interface AgendaFilters {
  status?: string;
  from?: string;
  to?: string;
  /** CLI-64: solo tiene efecto si quien pide la agenda es admin — un odontólogo siempre ve la suya (lo aplica el backend). */
  doctorId?: string;
  /** CLI-110: `all` = agenda común (todos los doctores); sin valor = la propia. */
  scope?: 'mine' | 'all';
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
    if (filters.doctorId) {
      params['doctorId'] = filters.doctorId;
    }
    if (filters.scope) {
      params['scope'] = filters.scope;
    }
    return this.http.get<AppointmentAgendaItem[]>(this.base, { params });
  }

  /** CLI-148: el doctor agenda una cita para un paciente con ficha. */
  createByDoctor(request: CreateDoctorAppointmentRequest): Observable<AppointmentAgendaItem> {
    return this.http.post<AppointmentAgendaItem>(`${this.base}/doctor`, request);
  }

  /** CLI-149: mueve una cita confirmada propia a otro horario. */
  rescheduleByDoctor(
    id: string,
    request: RescheduleDoctorAppointmentRequest,
  ): Observable<AppointmentAgendaItem> {
    return this.http.patch<AppointmentAgendaItem>(`${this.base}/doctor/${id}`, request);
  }

  /** CLI-149: cancela una cita confirmada propia (idempotente). */
  cancelByDoctor(id: string, reason?: string): Observable<AppointmentAgendaItem> {
    return this.http.post<AppointmentAgendaItem>(
      `${this.base}/doctor/${id}/cancel`,
      reason ? { reason } : {},
    );
  }

  /** CLI-148: horario de atención del doctor logueado. */
  getMySchedule(): Observable<DoctorScheduleBlock[]> {
    return this.http.get<DoctorScheduleBlock[]>(`${this.base}/my-schedule`);
  }
}
