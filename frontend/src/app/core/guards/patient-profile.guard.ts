import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../auth/application/auth.service';
import { PatientsService } from '../../features/patients/services/patients.service';

// Corre después de authGuard: una sesión válida no alcanza para entrar al
// dashboard de paciente — hace falta una ficha (patients) ya asociada. Sin
// esto, cualquier login de Google sin invitación cae en el shell vacío de
// paciente (ver CLI-20).
export const patientProfileGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const patientsService = inject(PatientsService);
  const router = inject(Router);

  await authService.authReady;

  const user = authService.currentUser();
  if (user?.role === 'odontologist') {
    return true;
  }

  const status = await firstValueFrom(patientsService.getMyPatientStatus());
  return status.exists ? true : router.createUrlTree(['/'], { queryParams: { sinFicha: 1 } });
};
