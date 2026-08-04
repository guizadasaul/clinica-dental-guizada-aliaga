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
    path: 'callback',
    loadComponent: () =>
      import('./ui/callback/callback').then((m) => m.CallbackComponent),
  },
];
