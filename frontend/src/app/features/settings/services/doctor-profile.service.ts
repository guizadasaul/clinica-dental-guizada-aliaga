import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { DoctorProfile, UpdateDoctorProfileRequest } from '../models/doctor-profile.model';

@Injectable({ providedIn: 'root' })
export class DoctorProfileService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.backendUrl}/doctors/me`;

  getMine(): Observable<DoctorProfile> {
    return this.http.get<DoctorProfile>(this.base);
  }

  updateMine(data: UpdateDoctorProfileRequest): Observable<DoctorProfile> {
    return this.http.patch<DoctorProfile>(this.base, data);
  }
}
