import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { DiagnosisCategory } from '../models/diagnosis.model';

@Injectable({ providedIn: 'root' })
export class DiagnosesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.backendUrl}/diagnoses`;

  getCatalog(): Observable<DiagnosisCategory[]> {
    return this.http.get<DiagnosisCategory[]>(this.base);
  }
}
