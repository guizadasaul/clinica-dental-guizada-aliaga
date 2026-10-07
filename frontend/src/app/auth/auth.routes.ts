import { Routes } from '@angular/router';

export const authRoutes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./ui/login/login').then((m) => m.LoginComponent),
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./ui/forgot-password/forgot-password').then((m) => m.ForgotPasswordComponent),
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./ui/reset-password/reset-password').then((m) => m.ResetPasswordComponent),
  },
  {
    // Link del correo de confirmación que manda el backend (CLI-242).
    path: 'confirmar',
    loadComponent: () =>
      import('./ui/confirm-email/confirm-email').then((m) => m.ConfirmEmailComponent),
  },
  {
    path: 'callback',
    loadComponent: () =>
      import('./ui/callback/callback').then((m) => m.CallbackComponent),
  },
];
