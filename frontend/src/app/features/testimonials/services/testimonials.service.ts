import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { TestimonialResponse } from '../models/testimonial.model';
import type { CreateTestimonialRequest } from '../models/testimonial.request';

@Injectable({ providedIn: 'root' })
export class TestimonialsService {
  private readonly http = inject(HttpClient);
  private readonly publicBase = `${environment.backendUrl}/public/testimonials`;
  private readonly adminBase = `${environment.backendUrl}/admin/testimonials`;

  submit(data: CreateTestimonialRequest): Observable<TestimonialResponse> {
    return this.http.post<TestimonialResponse>(this.publicBase, data);
  }

  getApproved(): Observable<TestimonialResponse[]> {
    return this.http.get<TestimonialResponse[]>(this.publicBase);
  }

  /** Requiere sesión de administrador (SupabaseAuthGuard + RolesGuard en el backend). */
  getPending(): Observable<TestimonialResponse[]> {
    return this.http.get<TestimonialResponse[]>(`${this.adminBase}/pending`);
  }

  approve(id: string): Observable<TestimonialResponse> {
    return this.http.patch<TestimonialResponse>(`${this.adminBase}/${id}/status`, {
      status: 'approved',
    });
  }

  reject(id: string): Observable<TestimonialResponse> {
    return this.http.patch<TestimonialResponse>(`${this.adminBase}/${id}/status`, {
      status: 'rejected',
    });
  }
}
