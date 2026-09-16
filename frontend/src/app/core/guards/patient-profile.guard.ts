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

  // authReady cubre el reload/carga inicial; waitForSync cubre un login o
  // registro que acaba de pasar dentro de esta misma sesión de la app (donde
  // authReady ya está resuelta desde el arranque y no sirve para esperar el
  // sync nuevo) — hacen falta las dos.
  await authService.authReady;
  await authService.waitForSync();

  const user = authService.currentUser();
  if (user?.role === 'odontologist' || user?.role === 'admin') {
    return true;
  }

  const status = await firstValueFrom(patientsService.getMyPatientStatus());
  return status.exists ? true : router.createUrlTree(['/'], { queryParams: { sinFicha: 1 } });
};
