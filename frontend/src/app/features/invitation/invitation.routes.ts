import { Routes } from '@angular/router';

export const invitationRoutes: Routes = [
  {
    path: ':token',
    loadComponent: () =>
      import('./components/invitation-landing/invitation-landing').then(
        (c) => c.InvitationLandingComponent,
      ),
  },
];
