import { Routes } from '@angular/router';

export const authRoutes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./ui/login/login').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./ui/register/register').then((m) => m.RegisterComponent),
  },
  {
    path: 'callback',
    loadComponent: () =>
      import('./ui/callback/callback').then((m) => m.CallbackComponent),
  },
];
