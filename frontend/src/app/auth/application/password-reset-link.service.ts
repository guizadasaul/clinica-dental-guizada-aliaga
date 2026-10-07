import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ResetLinkStatus {
  valid: boolean;
  /** Últimos 3 dígitos del teléfono de la cuenta, solo con el link vigente. */
  phoneHint?: string;
}

/**
 * Link de contraseña nueva por WhatsApp para cuentas sin correo (CLI-244):
 * el doctor lo arma desde la lista de pacientes y el paciente lo usa en
 * /recuperar/:token sin iniciar sesión.
 */
@Injectable({ providedIn: 'root' })
export class PasswordResetLinkService {
  private readonly http = inject(HttpClient);
  private readonly backendUrl = environment.backendUrl;

  createLink(patientId: string): Observable<{ whatsappUrl: string }> {
    return this.http.post<{ whatsappUrl: string }>(
      `${this.backendUrl}/patients/${patientId}/password-reset-links`,
      {},
    );
  }

  checkStatus(token: string): Observable<ResetLinkStatus> {
    return this.http.get<ResetLinkStatus>(`${this.backendUrl}/password-reset/${token}/status`);
  }

  resetPassword(token: string, password: string): Observable<void> {
    return this.http.post<void>(`${this.backendUrl}/password-reset/${token}`, { password });
  }
}
