import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { AdminDoctorDetail, AdminDoctorSummary, CreateDoctorResult } from '../models/admin-doctor.model';
import type { CreateDoctorRequest, UpdateDoctorRequest } from '../models/admin-doctor.request';
import type { InviteChannel } from '../../patient-invites/services/patient-invites.service';
import type { CreateInviteResponse } from '../../patient-invites/models/invite.model';

@Injectable({ providedIn: 'root' })
export class AdminDoctorsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.backendUrl}/admin/doctors`;

  getAll(): Observable<AdminDoctorSummary[]> {
    return this.http.get<AdminDoctorSummary[]>(this.base);
  }

  getById(id: string): Observable<AdminDoctorDetail> {
    return this.http.get<AdminDoctorDetail>(`${this.base}/${id}`);
  }

  create(data: CreateDoctorRequest): Observable<CreateDoctorResult> {
    return this.http.post<CreateDoctorResult>(this.base, data);
  }

  update(id: string, data: UpdateDoctorRequest): Observable<AdminDoctorDetail> {
    return this.http.patch<AdminDoctorDetail>(`${this.base}/${id}`, data);
  }

  /** Manda (o reenvía) el link de invitación al doctor por el canal elegido. Devuelve `whatsappUrl` solo para WhatsApp. */
  createInvite(id: string, channel: InviteChannel): Observable<CreateInviteResponse> {
    return this.http.post<CreateInviteResponse>(`${this.base}/${id}/invites`, { channel });
  }

  deactivate(id: string): Observable<AdminDoctorDetail> {
    return this.http.patch<AdminDoctorDetail>(`${this.base}/${id}/deactivate`, {});
  }
}
