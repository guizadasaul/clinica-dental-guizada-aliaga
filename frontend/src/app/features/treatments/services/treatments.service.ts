import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { Treatment, ToothProcedure } from '../models/treatment.model';
import type { CreateToothProcedureRequest } from '../models/treatment.request';

@Injectable({ providedIn: 'root' })
export class TreatmentsService {
  private readonly http = inject(HttpClient);
  private readonly treatmentsBase = `${environment.backendUrl}/treatments`;
  private readonly patientsBase = `${environment.backendUrl}/patients`;

  getAll(): Observable<Treatment[]> {
    return this.http.get<Treatment[]>(this.treatmentsBase);
  }

  createToothProcedure(patientId: string, data: CreateToothProcedureRequest): Observable<ToothProcedure> {
    return this.http.post<ToothProcedure>(`${this.patientsBase}/${patientId}/tooth-procedures`, data);
  }

  getToothProcedures(patientId: string): Observable<ToothProcedure[]> {
    return this.http.get<ToothProcedure[]>(`${this.patientsBase}/${patientId}/tooth-procedures`);
  }
}
