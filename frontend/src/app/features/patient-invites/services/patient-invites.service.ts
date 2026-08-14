import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { CreateInviteResponse, InviteStatusResponse } from '../models/invite.model';

export type InviteChannel = 'email' | 'whatsapp';

@Injectable({ providedIn: 'root' })
export class PatientInvitesService {
  private readonly http = inject(HttpClient);
  private readonly backendUrl = environment.backendUrl;

  createInvite(patientId: string, channel: InviteChannel): Observable<CreateInviteResponse> {
    return this.http.post<CreateInviteResponse>(
      `${this.backendUrl}/patients/${patientId}/invites`,
      {
        channel,
      },
    );
  }

  checkStatus(token: string): Observable<InviteStatusResponse> {
    return this.http.get<InviteStatusResponse>(`${this.backendUrl}/invites/${token}/status`);
  }
}
