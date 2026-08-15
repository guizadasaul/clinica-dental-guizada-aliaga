import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';
import { patientProfileGuard } from '../../core/guards/patient-profile.guard';

export const dashboardRoutes: Routes = [
  {
    path: '',
    canActivate: [authGuard, patientProfileGuard],
    loadComponent: () =>
      import('./components/dashboard-page/dashboard-page').then((c) => c.DashboardPageComponent),
  },
];
