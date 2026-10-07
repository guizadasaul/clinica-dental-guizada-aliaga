import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./landing/landing.routes').then((r) => r.landingRoutes),
  },
  {
    path: 'auth',
    loadChildren: () => import('./auth/auth.routes').then((r) => r.authRoutes),
  },
  {
    path: 'dashboard',
    loadChildren: () =>
      import('./features/dashboard/dashboard.routes').then((r) => r.dashboardRoutes),
  },
  {
    path: 'reservar',
    loadChildren: () => import('./features/booking/booking.routes').then((r) => r.bookingRoutes),
  },
  {
    path: 'invitacion',
    loadChildren: () =>
      import('./features/invitation/invitation.routes').then((r) => r.invitationRoutes),
  },
  {
    // Link de contraseña nueva que manda la clínica por WhatsApp (CLI-244).
    path: 'recuperar/:token',
    loadComponent: () =>
      import('./auth/ui/new-password/new-password').then((c) => c.NewPasswordComponent),
  },
];
