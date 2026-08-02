import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () =>
      import('./landing/landing.routes').then((r) => r.landingRoutes),
  },
  {
    path: 'auth',
    loadChildren: () =>
      import('./auth/auth.routes').then((r) => r.authRoutes),
  },
  {
    path: 'dashboard',
    loadChildren: () =>
      import('./features/dashboard/dashboard.routes').then((r) => r.dashboardRoutes),
  },
];
