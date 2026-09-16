import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { AdminDoctorDetail, AdminDoctorSummary, CreateDoctorResult } from '../models/admin-doctor.model';
import type { CreateDoctorRequest, UpdateDoctorRequest } from '../models/admin-doctor.request';

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

  deactivate(id: string): Observable<AdminDoctorDetail> {
    return this.http.patch<AdminDoctorDetail>(`${this.base}/${id}/deactivate`, {});
  }
}
