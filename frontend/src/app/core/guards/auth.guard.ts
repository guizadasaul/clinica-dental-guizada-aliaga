import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../auth/application/auth.service';

export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Esperar a que Firebase restaure la sesión persistida antes de decidir.
  await authService.authReady;

  return authService.currentUser() !== null
    ? true
    : router.createUrlTree(['/auth/login']);
};
