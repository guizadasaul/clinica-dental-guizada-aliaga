import { Routes } from '@angular/router';

export const landingRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./ui/landing/landing').then((c) => c.LandingComponent),
  },
];
