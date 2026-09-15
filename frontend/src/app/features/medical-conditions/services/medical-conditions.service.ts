import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { MedicalCondition } from '../models/medical-condition.model';

@Injectable({ providedIn: 'root' })
export class MedicalConditionsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.backendUrl}/medical-conditions`;

  getCatalog(): Observable<MedicalCondition[]> {
    return this.http.get<MedicalCondition[]>(this.base);
  }
}
